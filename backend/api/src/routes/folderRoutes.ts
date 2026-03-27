import express from "express";
import {
	getFolders,
	createFolder,
	updateFolder,
	deleteFolder,
} from "../controllers/folderController";
import { protect, adminOnly } from "../middleware/auth";

const router = express.Router();

router.get("/", protect, getFolders);
router.post("/", protect, adminOnly, createFolder);
router.put("/:id", protect, adminOnly, updateFolder);
router.delete("/:id", protect, adminOnly, deleteFolder);

export default router;
