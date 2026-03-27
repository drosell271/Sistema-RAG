import { Request, Response } from "express";
import { celeryClient } from "../services/celeryService";
import { QdrantClient } from "@qdrant/js-client-rest";
import dotenv from "dotenv";

dotenv.config();

const qdrantUrl = process.env.QDRANT_URL;
if (!qdrantUrl) {
	throw new Error("QDRANT_URL must be set in .env");
}
const qdrant = new QdrantClient({
	url: qdrantUrl,
	apiKey: process.env.QDRANT_API_KEY,
});
const COLLECTION_NAME = process.env.QDRANT_COLLECTION;
if (!COLLECTION_NAME) {
	throw new Error("QDRANT_COLLECTION must be set in .env");
}

import Settings from "../models/Settings";
import User from "../models/User";
import Folder from "../models/Folder";

export const search = async (req: Request, res: Response) => {
	try {
		const { query, limit, filters, threshold } = req.body;

		if (!query) {
			return res.status(400).json({ detail: "Query required" });
		}

		// --- Access Control: Restrict folders for non-admin users ---
		const userRequest = req as any;
		const userId = userRequest.user?.user_id;
		const userRole = userRequest.user?.role;

		if (!userId) {
			return res.status(401).json({ detail: "Not authorized" });
		}

		let allowedFolderIds: string[] | null = null; // null = no restriction (admin)

		if (userRole !== "admin") {
			// Fetch user to get latest group_ids
			const user = await User.findById(userId);
			const userGroups = user?.group_ids || [];

			// Same logic as getFolders in folderController
			const allowedFolders = await Folder.find({
				$or: [
					{ is_public: true },
					{ allowed_group_ids: { $size: 0 } },
					{ allowed_group_ids: { $exists: false } },
					{ allowed_group_ids: { $in: userGroups } },
				],
			});

			allowedFolderIds = allowedFolders.map(
				(f) => (f as any).id || (f as any)._id.toString(),
			);

			// If no folders accessible, return empty results immediately
			if (allowedFolderIds.length === 0) {
				return res.json({ results: [] });
			}
		}

		// Fetch Dynamic Settings
		const limitSetting = await Settings.findOne({ key: "SEARCH_LIMIT" });
		const thresholdSetting = await Settings.findOne({
			key: "SEARCH_THRESHOLD",
		});

		const effectiveLimit =
			limit ||
			limitSetting?.value ||
			parseInt(process.env.SEARCH_LIMIT || "10");

		// Priority: Request Body > DB Setting > Env Var > Default
		const minScore =
			threshold !== undefined
				? threshold
				: thresholdSetting?.value !== undefined
					? thresholdSetting.value
					: parseFloat(process.env.SEARCH_THRESHOLD || "0.6");

		// Build task filters with access control
		const taskFilters: any = {};
		if (filters) {
			if (filters.folder_id) {
				// Validate that the requested folder is in the allowed list
				if (
					allowedFolderIds &&
					!allowedFolderIds.includes(filters.folder_id)
				) {
					return res.status(403).json({
						detail: "No tienes acceso a esta carpeta",
					});
				}
				taskFilters.folder_id = filters.folder_id;
			}
			if (filters.type) taskFilters.type = filters.type;
			if (filters.sender) taskFilters.sender = filters.sender;
		}

		// If non-admin and no specific folder_id was requested, restrict to allowed folders
		if (allowedFolderIds && !taskFilters.folder_id) {
			taskFilters.folder_ids = allowedFolderIds;
		}

		// Rerank enabled by default for now, or could be a flag
		const doRerank = true;

		const taskId = await celeryClient.sendTask(
			"tasks.perform_advanced_search_task",
			[query, effectiveLimit, taskFilters, doRerank, minScore],
		);

		// Wait for result
		const searchResults = await celeryClient.getAsyncResult(taskId);

		if (!searchResults) {
			throw new Error("No results returned from worker");
		}

		// 3. Format Response
		const results = searchResults.map((hit: any) => {
			const doc = hit.doc;
			// If payload is nested in doc
			const meta = doc ? doc.payload : hit.payload;

			return {
				id: doc ? doc.id : hit.id,
				score: hit.score,
				text: doc ? doc.text : hit.text,
				metadata: meta,
			};
		});

		res.json({ results });
	} catch (error: any) {
		console.error("Search Error Trace:", error);
		if (error.response) {
			console.error("Upstream Response:", error.response.data);
		}
		res.status(500).json({ detail: `Search failed: ${error.message}` });
	}
};
