import express from "express";
import Log from "../models/Log";
import logger from "../config/logger";
import { protect, adminOnly } from "../middleware/auth";

const router = express.Router();

/**
 * GET /api/v1/logs
 * List logs with pagination and filtering
 */
router.get("/", protect, adminOnly, async (req, res) => {
	try {
		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 50;
		const type = req.query.type as string;
		const status = req.query.status as string;
		const search = req.query.search as string;

		const query: any = {};

		if (type) query.type = type;
		if (status) query.status = status;
		if (search) {
			query.$or = [
				{ filename: { $regex: search, $options: "i" } },
				{ message: { $regex: search, $options: "i" } },
				{ doc_id: search },
			];
		}

		const total = await Log.countDocuments(query);
		const logs = await Log.find(query)
			.sort({ timestamp: -1 })
			.skip((page - 1) * limit)
			.limit(limit);

		res.json({
			data: logs,
			pagination: {
				total,
				page,
				pages: Math.ceil(total / limit),
			},
		});
	} catch (error) {
		logger.error("Error fetching logs:", error);
		res.status(500).json({ error: "Failed to fetch logs" });
	}
});

/**
 * DELETE /api/v1/logs/:id
 * Delete a specific log entry
 */
router.delete("/:id", protect, adminOnly, async (req, res) => {
	try {
		const { id } = req.params;
		await Log.findByIdAndDelete(id);
		res.json({ message: "Log deleted" });
	} catch (error) {
		logger.error("Error deleting log:", error);
		res.status(500).json({ error: "Failed to delete log" });
	}
});

export default router;
