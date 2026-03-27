import express from "express";
import { getSettings, updateSettings } from "../controllers/settingsController";
import { protect, adminOnly } from "../middleware/auth";

const router = express.Router();

router.get("/", getSettings);
router.post("/", protect, adminOnly, updateSettings);

export default router;
