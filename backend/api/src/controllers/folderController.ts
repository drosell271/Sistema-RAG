import { Request, Response } from "express";
import Folder from "../models/Folder";
import websocketService from "../services/websocketService";
import User from "../models/User";

export const getFolders = async (req: Request, res: Response) => {
	try {
		// Access user from request (set by protect middleware)
		const userRequest = req as any;
		const userId = userRequest.user?.user_id;
		const userRole = userRequest.user?.role;

		if (!userId) {
			return res.status(401).json({ detail: "Not authorized" });
		}

		let query = {};

		// If not admin, restrict by groups
		if (userRole !== "admin") {
			// Fetch user to get latest groups (in case token is stale)
			const user = await User.findById(userId);
			const userGroups = user?.group_ids || [];

			query = {
				$or: [
					{ is_public: true },
					{ allowed_group_ids: { $size: 0 } }, // Visible to all if no groups assigned
					{ allowed_group_ids: { $exists: false } }, // Safety check for missing field
					{ allowed_group_ids: { $in: userGroups } },
				],
			};
		}

		const folders = await Folder.find(query);
		res.json(folders);
	} catch (error) {
		console.error("Get Folders Error:", error);
		res.status(500).json({ detail: "Server Error" });
	}
};

export const createFolder = async (req: Request, res: Response) => {
	try {
		const { name, parent_id, is_public, allowed_group_ids } = req.body;
		const folder = new Folder({
			name,
			parent_id: parent_id || null,
			is_public,
			allowed_group_ids,
		});
		const savedFolder = await folder.save();

		websocketService.broadcast({
			type: "folder_created",
			payload: savedFolder,
		});

		res.json(savedFolder);
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const updateFolder = async (req: Request, res: Response) => {
	try {
		const { id } = req.params;
		const changes = req.body;
		const updatedFolder = await Folder.findByIdAndUpdate(id, changes, {
			new: true,
		});
		if (!updatedFolder) {
			return res.status(404).json({ detail: "Folder not found" });
		}

		websocketService.broadcast({
			type: "folder_updated",
			payload: updatedFolder,
		});

		res.json(updatedFolder);
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

import fs from "fs";
import path from "path";
import Document from "../models/Document";
import qdrantService from "../services/qdrantService";

const DOCS_DIR = process.env.DOCS_DIR;
if (!DOCS_DIR) {
	throw new Error("DOCS_DIR must be set in .env");
}

export const deleteFolder = async (req: Request, res: Response) => {
	try {
		const { id } = req.params;

		console.log(
			`[Delete Folder] Starting recursive delete for folder: ${id}`,
		);

		// 1. Find all descendant folder IDs (inclusive of the target folder)
		const foldersToDelete = [id];
		const queue = [id];

		while (queue.length > 0) {
			const currentId = queue.shift();
			const children = await Folder.find({ parent_id: currentId });
			for (const child of children) {
				// Determine the correct ID to use (id or _id)
				// Since Mongoose models might return _id by default unless transformed
				const childId: string =
					(child as any).id || (child as any)._id.toString();
				foldersToDelete.push(childId);
				queue.push(childId);
			}
		}

		console.log(
			`[Delete Folder] Found ${foldersToDelete.length} folders to delete.`,
		);

		// 2. Find all documents in these folders
		const docsToDelete = await Document.find({
			folder_id: { $in: foldersToDelete },
		});
		console.log(
			`[Delete Folder] Found ${docsToDelete.length} documents to delete.`,
		);

		// 3. Process Deletions
		// 3. Process Deletions

		// A. Batch Delete from Qdrant
		const docIds = docsToDelete.map((d) => d._id);
		if (docIds.length > 0) {
			await qdrantService.deleteVectorsBatch(docIds);
		}

		// B. Delete from Filesystem (Parallelized)
		await Promise.all(
			docsToDelete.map(async (doc) => {
				try {
					const storedFilename = doc.get("stored_filename");
					if (storedFilename) {
						const filePath = path.join(DOCS_DIR, storedFilename);
						if (fs.existsSync(filePath)) {
							await fs.promises.unlink(filePath);
						}
					}
				} catch (e) {
					console.error(
						`[Delete Folder] Error cleaning up file for doc ${doc._id}:`,
						e,
					);
				}
			}),
		);

		// 4. Batch Delete from Mongo
		await Document.deleteMany({ folder_id: { $in: foldersToDelete } });
		await Folder.deleteMany({ _id: { $in: foldersToDelete } });

		websocketService.broadcast({
			type: "folder_deleted",
			payload: { ids: foldersToDelete },
		});

		res.json({
			status: "success",
			deletedFolders: foldersToDelete.length,
			deletedDocs: docsToDelete.length,
		});
	} catch (error) {
		console.error("[Delete Folder] Error:", error);
		res.status(500).json({ detail: "Server Error" });
	}
};
