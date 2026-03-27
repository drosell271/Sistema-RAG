import express from "express";
import {
	register,
	login,
	getMe,
	forgotPassword,
	resetPassword,
} from "../controllers/authController";
import { protect } from "../middleware/auth";

const router = express.Router();

router.post("/register", register);
router.post("/login", login); // JSON support
router.post("/token", login); // OAuth2 compatibility endpoint (often uses simple login logic here for simplification)
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", protect, getMe);

export default router;
