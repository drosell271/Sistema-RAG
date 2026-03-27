import express from "express";
import { simulateEmail } from "../controllers/emailController";
import { protect, adminOnly } from "../middleware/auth";

const router = express.Router();

router.post("/simulate", protect, adminOnly, simulateEmail);

export default router;
