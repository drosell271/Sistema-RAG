import express from "express";
import {
	getGroups,
	createGroup,
	updateGroup,
	deleteGroup,
} from "../controllers/groupController";
import {
	addUserToGroup,
	removeUserFromGroup,
} from "../controllers/userController";
import { protect, adminOnly } from "../middleware/auth";

const router = express.Router();

// Groups usually managed by admin or authorized users
router.get("/", protect, getGroups);
router.post("/", protect, adminOnly, createGroup);
router.put("/:id", protect, adminOnly, updateGroup);
router.delete("/:id", protect, adminOnly, deleteGroup);

// Group Membership
router.post("/:groupId/users/:userId", protect, adminOnly, addUserToGroup);
router.delete(
	"/:groupId/users/:userId",
	protect,
	adminOnly,
	removeUserFromGroup,
);

export default router;
