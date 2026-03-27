import { Request, Response } from "express";
import Document from "../models/Document";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { celeryClient } from "../services/celeryService";
import Settings from "../models/Settings";

const DOCS_DIR = process.env.DOCS_DIR;
if (!DOCS_DIR) {
	throw new Error("DOCS_DIR must be set in .env");
}
const EMAIL_DIR = path.join(DOCS_DIR, "emails");
// User requested to remove this automated folder creation for simulation
// if (!fs.existsSync(EMAIL_DIR)) {
// 	fs.mkdirSync(EMAIL_DIR, { recursive: true });
// }

export const simulateEmail = async (req: Request, res: Response) => {
	try {
		const { sender, subject, body } = req.body;

		if (!sender || !subject || !body) {
			return res
				.status(400)
				.json({ detail: "Missing sender, subject, or body" });
		}

		console.log(`[Email Sim] Receiving email from ${sender}: ${subject}`);

		// Check if Simulator/Email Service is "configured" (Mock check as per requirement)
		console.log(`[Email Sim] Receiving email from ${sender}: ${subject}`);

		const doc_id = uuidv4();
		// Sanitize filename
		const safe_subject = subject
			.replace(/[^a-z0-9]/gi, "_")
			.toLowerCase()
			.substring(0, 50);
		const filename = `email_${safe_subject}.txt`;
		const stored_filename = `${doc_id}_${filename}`;
		const file_location = path.join(EMAIL_DIR, stored_filename);

		// Create Text Content
		const fileContent = `From: ${sender}\nSubject: ${subject}\nDate: ${new Date().toISOString()}\n\n${body}`;

		await fs.promises.writeFile(file_location, fileContent, "utf-8");

		// Create DB Entry
		const newDoc = new Document({
			_id: doc_id,
			filename: filename,
			stored_filename: path.join("emails", stored_filename), // Relative path for retrieval if needed, or just stored_filename if flattened
			// stored_filename is usually just the basename in root DOCS_DIR.
			// BUT here we put it in 'emails' subdir.
			// backend serves DOCS_DIR.
			// If we want to serve it, we might need to adjust getPreview.
			// For now, let's keep it simple and put it in DOCS_DIR root to avoid complications with existing logic?
			// "Save body as .txt in uploads/emails/" was the plan.
			// Let's stick to plan but ensure getPreview handles it?
			// Actually, `path.join(DOCS_DIR, stored_filename)` is used in getPreview.
			// If stored_filename includes "emails/...", it might work if DOCS_DIR is root.
			folder_id: null, // Root or specialized folder?
			size: Buffer.byteLength(fileContent),
			status: "Uploaded",
			type: "email",
			upload_date: new Date(),
			metadata: {
				sender,
				subject,
			},
		});

		// Let's actually put it in DOCS_DIR root for consistency with other docs unless we add "emails" to DOCS_DIR path everywhere.
		// The Plan said "uploads/emails/".
		// Let's try to honor that.
		// If stored_filename is "emails/xyz.txt" and DOCS_DIR is "uploads", path.join is "uploads/emails/xyz.txt".
		// This works for FS.
		// getPreview uses `path.join(DOCS_DIR, storedFilename)`. So it Should work.

		newDoc.stored_filename = path.join("emails", stored_filename);

		await newDoc.save();

		// Get Embed Settings
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
			folder_id: null,
			filename: filename,
			sender: sender,
		};

		await celeryClient.sendTask("tasks.process_document_task", [
			file_location, // Absolute path
			doc_id,
			null, // folder_id
			chunk_config,
			extra_metadata,
		]);

		res.json({ message: "Email received and processing started", doc_id });
	} catch (error: any) {
		console.error("[Email Sim Error]", error);
		res.status(500).json({ detail: error.message });
	}
};
