import { Request, Response } from "express";
import Document from "../models/Document";
import Settings from "../models/Settings";
import Folder from "../models/Folder";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { celeryClient } from "../services/celeryService";
import websocketService from "../services/websocketService";
import qdrantService from "../services/qdrantService";

const DOCS_DIR = process.env.DOCS_DIR;
if (!DOCS_DIR) {
	throw new Error("DOCS_DIR must be set in .env");
}
if (!fs.existsSync(DOCS_DIR)) {
	fs.mkdirSync(DOCS_DIR, { recursive: true });
}

export const uploadDocument = async (req: Request | any, res: Response) => {
	try {
		if (!req.file) {
			return res.status(400).json({ detail: "No file uploaded" });
		}

		console.log(
			`[Upload] Starting upload for file: ${req.file.originalname}`,
		);

		const file = req.file;
		// Check Dynamic File Size Limit
		const sizeSetting = await Settings.findOne({ key: "MAX_FILE_SIZE_MB" });
		// Use default 50 if DB setting missing, then env, then hard fallback
		const maxMb =
			sizeSetting?.value ||
			parseInt(process.env.MAX_FILE_SIZE_MB || "50");
		if (file.size > maxMb * 1024 * 1024) {
			await fs.promises.unlink(req.file.path).catch(() => {});
			return res
				.status(400)
				.json({ detail: `File too large. Max size is ${maxMb}MB` });
		}

		// Helper to fix Encoding (Latin1 -> UTF8)
		// Fixes Mojibake like "TÃRMICA" -> "TÉRMICA"
		const fixEncoding = (str: string) => {
			try {
				return Buffer.from(str, "latin1").toString("utf8");
			} catch (e) {
				return str;
			}
		};

		// Normalize folder_id: 'null' string -> null value
		let folder_id = req.body.folder_id;
		if (folder_id === "null" || folder_id === "undefined" || !folder_id) {
			folder_id = null;
		}

		// Fix filename encoding
		const originalName = fixEncoding(file.originalname);
		console.log(
			`[Upload] Filename fixed: ${file.originalname} -> ${originalName}`,
		);

		// Generate Identifiers
		const doc_id = uuidv4();
		const safe_filename = `${doc_id}_${originalName}`;
		const file_location = path.join(DOCS_DIR, safe_filename);

		// RENAME to safe_filename (Use copy/unlink for cross-device support)
		await fs.promises.copyFile(req.file.path, file_location);
		await fs.promises.unlink(req.file.path);

		// Check for Duplicates in the same folder
		console.log(
			`[Upload] Checking duplicates for: ${originalName} in folder: ${folder_id}`,
		);
		const existingDoc = await Document.findOne({
			filename: originalName,
			folder_id: folder_id,
		});

		if (existingDoc) {
			console.log(`[Upload] Duplicate found: ${existingDoc._id}`);
			// Clean up uploaded file
			await fs.promises.unlink(file_location).catch(() => {});
			return res.status(409).json({
				detail: "File with this name already exists in the folder",
			});
		}

		console.log(`[Upload] File moved to: ${file_location}`);

		// Create DB Entry
		const newDoc = new Document({
			_id: doc_id,
			filename: originalName,
			stored_filename: safe_filename,
			folder_id: folder_id,
			size: file.size,
			status: "Uploaded",
			type: "pdf",
		});

		await newDoc.save();
		console.log(`[Upload] Metadata saved to DB: ${doc_id}`);

		// Dispatch Task
		// Get Settings from DB or Env (Doc specific)
		const chunkSetting = await Settings.findOne({ key: "DOC_CHUNK_SIZE" });
		const overlapSetting = await Settings.findOne({
			key: "DOC_CHUNK_OVERLAP",
		});

		const chunk_size =
			chunkSetting?.value ||
			parseInt(process.env.DOC_CHUNK_SIZE || "1000");
		const chunk_overlap =
			overlapSetting?.value ||
			parseInt(process.env.DOC_CHUNK_OVERLAP || "200");

		const chunk_config = { chunk_size: chunk_size, overlap: chunk_overlap };
		const extra_metadata = {
			doc_id: doc_id,
			folder_id: folder_id,
			filename: originalName,
		};

		console.log(`[Upload] Dispatching Celery task...`);
		await celeryClient.sendTask("tasks.process_document_task", [
			file_location,
			doc_id,
			folder_id,
			chunk_config,
			extra_metadata,
		]);
		console.log(`[Upload] Task dispatched successfully.`);

		res.json(newDoc);
	} catch (error: any) {
		console.error("[Upload Error] Full Trace:", error);
		res.status(500).json({ detail: `Upload failed: ${error.message}` });
	}
};

export const listDocuments = async (req: Request, res: Response) => {
	try {
		const { folder_id, page = 1, limit = 50 } = req.query;
		const query: any = {};

		if (folder_id !== undefined) {
			if (folder_id === "null" || folder_id === "root") {
				query.folder_id = null;
			} else if (folder_id === "all") {
				// No filter on folder_id, return ALL
			} else {
				query.folder_id = folder_id;
			}
		}

		const pageNum = parseInt(page as string) || 1;
		const limitNum = parseInt(limit as string) || 50;
		const skip = (pageNum - 1) * limitNum;

		console.log(
			`[List] Query: ${JSON.stringify(query)} | Page: ${pageNum}`,
		);

		const total = await Document.countDocuments(query);
		const docs = await Document.find(query)
			.sort({ upload_date: -1 })
			.skip(skip)
			.limit(limitNum);

		console.log(`[List] Found ${docs.length} docs (Total: ${total})`);

		res.json({
			docs,
			total,
			page: pageNum,
			pages: Math.ceil(total / limitNum),
		});
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const getLibraryStats = async (req: Request, res: Response) => {
	try {
		const total_documents = await Document.countDocuments({ type: "pdf" });
		const total_emails = await Document.countDocuments({ type: "email" });
		const total_folders = await import("../models/Folder").then((m) =>
			m.default.countDocuments(),
		);

		const lastDoc = await Document.findOne().sort({ upload_date: -1 });

		res.json({
			total_documents,
			total_folders,
			total_emails,
			last_activity: lastDoc ? lastDoc.get("upload_date") : null,
		});
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const resetLibrary = async (req: Request, res: Response) => {
	try {
		console.log("[Reset] Starting library reset...");

		// 1. Reset Qdrant
		await qdrantService.resetCollection();

		// 2. Reset Mongo
		await Document.deleteMany({});
		await Folder.deleteMany({});

		// 3. Reset Filesystem
		// Delete all files in DOCS_DIR but keep the directory
		const files = await fs.promises.readdir(DOCS_DIR);
		for (const file of files) {
			const filePath = path.join(DOCS_DIR, file);
			// Ignore .gitkeep or other system files if needed, but for now delete all
			try {
				const stats = await fs.promises.lstat(filePath);
				if (stats.isDirectory()) {
					await fs.promises.rm(filePath, {
						recursive: true,
						force: true,
					});
				} else {
					await fs.promises.unlink(filePath);
				}
			} catch (e) {
				console.error(`[Reset] Failed to delete ${file}:`, e);
			}
		}

		res.json({ message: "Library reset successfully" });
	} catch (error: any) {
		console.error("[Reset Error]", error);
		res.status(500).json({ detail: `Reset failed: ${error.message}` });
	}
};

export const reprocessLibrary = async (req: Request, res: Response) => {
	try {
		console.log("[Reprocess] Starting library reprocessing...");

		// 1. Broadcast Start
		websocketService.broadcast({
			type: "task_update",
			payload: {
				status: "waiting",
				message: "Iniciando reprocesamiento...",
			},
		});

		// 2. Clear Qdrant
		await qdrantService.resetCollection();

		// 3. Fetch All Documents
		const docs = await Document.find({});
		const totalDocs = docs.length;

		// Reset status to preventing polling race condition
		await Document.updateMany({}, { $set: { status: "Queued" } });

		websocketService.broadcast({
			type: "task_update",
			payload: {
				status: "running",
				total: totalDocs,
				processed: 0,
				current: "Despachando tareas...",
			},
		});

		// 4. Dispatch Tasks
		let processed = 0;

		// Use Doc settings as default for reprocessing (or check type per doc?)
		// For now using DOC settings as majority are docs.
		const chunkSetting = await Settings.findOne({ key: "DOC_CHUNK_SIZE" });
		const overlapSetting = await Settings.findOne({
			key: "DOC_CHUNK_OVERLAP",
		});
		const chunk_size =
			chunkSetting?.value ||
			parseInt(process.env.DOC_CHUNK_SIZE || "1000");
		const chunk_overlap =
			overlapSetting?.value ||
			parseInt(process.env.DOC_CHUNK_OVERLAP || "200");
		const chunk_config = { chunk_size: chunk_size, overlap: chunk_overlap };

		for (const doc of docs) {
			const docId = doc._id; // Assuming string ID as per our model
			const storedFilename =
				doc.get("stored_filename") || doc.get("filename");
			const fileLocation = path.join(DOCS_DIR, storedFilename);
			const folderId = doc.get("folder_id");

			if (!fs.existsSync(fileLocation)) {
				console.warn(`[Reprocess] File not found: ${fileLocation}`);
				continue;
			}

			websocketService.broadcast({
				type: "task_update",
				payload: {
					status: "running",
					total: totalDocs,
					processed: processed,
					current: doc.get("filename"),
				},
			});

			const extra_metadata = {
				doc_id: docId,
				folder_id: folderId,
				filename: doc.get("filename"),
			};

			await celeryClient.sendTask("tasks.process_document_task", [
				fileLocation,
				docId,
				folderId,
				chunk_config,
				extra_metadata,
			]);

			processed++;
		}

		// Start Background Polling for Progress
		const pollInterval = setInterval(async () => {
			try {
				const indexedCount = await Document.countDocuments({
					status: { $regex: /^Indexed/ },
				});
				const failedCount = await Document.countDocuments({
					status: "Failed",
				});
				const currentProcessed = indexedCount + failedCount;

				if (currentProcessed >= totalDocs) {
					clearInterval(pollInterval);
					websocketService.broadcast({
						type: "task_update",
						payload: {
							status: "completed",
							total: totalDocs,
							processed: totalDocs,
							current: "Reprocesamiento completado",
						},
					});
				} else {
					// Get one currently processing doc name for UI
					const processingDoc = await Document.findOne({
						status: "Processing",
					}).select("filename");
					const currentFile = processingDoc
						? processingDoc.filename
						: "Procesando...";

					websocketService.broadcast({
						type: "task_update",
						payload: {
							status: "running",
							total: totalDocs,
							processed: currentProcessed,
							current: currentFile,
						},
					});
				}
			} catch (err) {
				console.error("Polling error:", err);
				clearInterval(pollInterval);
			}
		}, 2000); // Check every 2 seconds

		res.json({ message: "Reprocessing started" });
	} catch (error: any) {
		console.error("[Reprocess Error]", error);
		websocketService.broadcast({
			type: "task_update",
			payload: {
				status: "error",
				error: error.message,
			},
		});
		res.status(500).json({ detail: `Reprocess failed: ${error.message}` });
	}
};

export const uploadPst = async (req: Request | any, res: Response) => {
	try {
		if (!req.file) {
			return res.status(400).json({ detail: "No file uploaded" });
		}

		// Check Dynamic File Size Limit
		const sizeSetting = await Settings.findOne({ key: "MAX_FILE_SIZE_MB" });
		const maxMb =
			sizeSetting?.value ||
			parseInt(process.env.MAX_FILE_SIZE_MB || "50");
		if (req.file.size > maxMb * 1024 * 1024) {
			await fs.promises.unlink(req.file.path).catch(() => {});
			return res
				.status(400)
				.json({ detail: `File too large. Max size is ${maxMb}MB` });
		}

		console.log(
			`[Upload PST] Starting upload for file: ${req.file.originalname}`,
		);

		const file = req.file;
		const folder_id = req.body.folder_id || null;

		// Helper to fix Encoding (Latin1 -> UTF8)
		const fixEncoding = (str: string) => {
			try {
				return Buffer.from(str, "latin1").toString("utf8");
			} catch (e) {
				return str;
			}
		};

		const originalName = fixEncoding(file.originalname);
		const doc_id = uuidv4();
		const safe_filename = `temp_pst_${doc_id}_${originalName}`;
		const file_location = path.join(DOCS_DIR, safe_filename);

		await fs.promises.copyFile(req.file.path, file_location);
		await fs.promises.unlink(req.file.path);

		console.log(`[Upload PST] File moved to: ${file_location}`);

		const chunkSetting = await Settings.findOne({ key: "PST_CHUNK_SIZE" });
		const overlapSetting = await Settings.findOne({
			key: "PST_CHUNK_OVERLAP",
		});

		const chunk_size =
			chunkSetting?.value ||
			parseInt(process.env.PST_CHUNK_SIZE || "1500");
		const chunk_overlap =
			overlapSetting?.value ||
			parseInt(process.env.PST_CHUNK_OVERLAP || "300");

		const chunk_config = { chunk_size: chunk_size, overlap: chunk_overlap };

		await celeryClient.sendTask("tasks.process_pst_task", [
			file_location,
			doc_id, // Pass doc_id as job_id
			folder_id,
			chunk_config,
		]);

		res.json({
			message: "PST Uploaded and processing started",
			temp_id: doc_id,
		});
	} catch (error: any) {
		console.error("[Upload PST Error]", error);
		res.status(500).json({ detail: `Upload failed: ${error.message}` });
	}
};

export const deleteDocument = async (req: Request, res: Response) => {
	try {
		const { id } = req.params;
		const doc = await Document.findById(id);
		if (!doc) return res.status(404).json({ detail: "Document not found" });

		// 1. Delete from Qdrant
		// Verify if deleteVectors exists or if I need to use reset logic per doc?
		// qdrantService has deleteVectors(docId) implemented!
		await qdrantService.deleteVectors(id);

		// 2. Delete File
		const storedFilename = doc.get("stored_filename");
		if (storedFilename) {
			const filePath = path.join(DOCS_DIR, storedFilename);
			if (fs.existsSync(filePath)) {
				await fs.promises.unlink(filePath);
			}
		}

		// 3. Delete from Mongo
		await Document.findByIdAndDelete(id);

		res.json({ message: "Document deleted" });
	} catch (error) {
		console.error("Delete Error", error);
		res.status(500).json({ detail: "Server Error" });
	}
};

export const analyzeSettings = async (req: Request | any, res: Response) => {
	// Mock analysis
	res.json({
		suggested_chunk_size: 1000,
		suggested_chunk_overlap: 200,
		reasoning:
			"Analysis not yet implemented in Node.js version. Using defaults.",
	});
};

export const getPreview = async (req: Request, res: Response) => {
	try {
		const { docId } = req.params;
		const doc = await Document.findById(docId);
		if (!doc) return res.status(404).json({ detail: "Document not found" });

		const storedFilename = doc.get("stored_filename");
		const filePath = path.join(DOCS_DIR, storedFilename);

		if (!fs.existsSync(filePath)) {
			return res.status(404).json({ detail: "File not found on server" });
		}

		// Check if user wants page? for now serve file
		res.sendFile(path.resolve(filePath));
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const getContent = async (req: Request, res: Response) => {
	// Same as preview for now?
	// api.ts calls /content for raw download
	await getPreview(req, res);
};

export const getTaskStatus = async (req: Request, res: Response) => {
	// Return stub or rely on websocket
	res.json({ status: "active", tasks: [] });
};

export const cancelTask = async (req: Request, res: Response) => {
	try {
		// Cancel ALL active tasks? Or specific?
		// API `post("documents/tasks/cancel")` implies global cancel or payload?
		// Frontend `cancelTask(id)` in UploadContext implies per-task.
		// BUT `api.cancelTask()` in `api.ts` is a global endpoint `POST .../cancel` with NO args?
		// Let's check api.ts:
		// cancelTask: async () => api.post("documents/tasks/cancel")
		// It seems it cancels "reprocess" or "active global tasks".
		// IF the frontend calls it without ID, it implies global cancel.
		// However, UploadModal also has 'cancelTask(id)'.
		// Wait, `UploadContext` `cancelTask(id)` calls `controller.abort()`. It ONLY calls `api.cancelTask()` if `t.type === 'reprocess'`.
		// So `api.cancelTask()` is for Reprocess/Global tasks.
		// The individual upload cancellation is handled by AbortController (Network Abort).
		// Backend doesn't need to know about upload cancel unless it's already processing.
		// If Reprocess is running, we might want to set a global cancel flag?
		// Let's set a global cancel flag for reprocessing?
		// Or if we want to support cancelling processing of specific uploads, we need to know the docId.
		// For now, let's implement global cancel for Reprocess.

		await celeryClient.setCancelFlag("global_reprocess");
		// Also broadcast cancel
		websocketService.broadcast({
			type: "task_update",
			payload: {
				status: "cancelled",
				message: "User cancelled operation",
			},
		});
		res.json({ message: "Cancellation signal sent" });
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};
