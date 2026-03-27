import express from "express";
import { search } from "../controllers/searchController";
import { protect } from "../middleware/auth";

const router = express.Router();

router.post("/", protect, search);

export default router;
