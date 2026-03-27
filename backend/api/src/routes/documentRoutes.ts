import express from "express";
import multer from "multer";
import {
	uploadDocument,
	listDocuments,
	getLibraryStats,
	resetLibrary,
	reprocessLibrary,
	uploadPst,
	deleteDocument,
	analyzeSettings,
	getTaskStatus,
	cancelTask,
	getPreview,
	getContent,
} from "../controllers/documentController";
import { protect, adminOnly } from "../middleware/auth";
import os from "os";

const upload = multer({
	dest: os.tmpdir(),
}); // Save to temp dir first

const router = express.Router();

router.get("/stats", protect, getLibraryStats);
router.get("/", protect, listDocuments); // Allows query params for list

// Specific actions
router.delete("/reset", protect, adminOnly, resetLibrary);
router.post("/reprocess", protect, adminOnly, reprocessLibrary);
router.post("/analyze-settings", protect, adminOnly, analyzeSettings);

// Tasks
router.get("/tasks/status", protect, getTaskStatus);
router.post("/tasks/cancel", protect, cancelTask);

// Uploads
router.post(
	"/upload",
	protect,
	adminOnly,
	upload.single("file"),
	uploadDocument,
);
router.post(
	"/upload-pst",
	protect,
	adminOnly,
	upload.single("file"),
	uploadPst,
);

// Individual Document operations (Must be last to avoid conflict with static paths like /stats if careful, but /:id usually catches everything)
// Express matches in order. Static paths above are safe.
router.get("/:docId/preview", protect, getPreview);
router.get("/:docId/content", protect, getContent);
router.delete("/:id", protect, adminOnly, deleteDocument);

export default router;
