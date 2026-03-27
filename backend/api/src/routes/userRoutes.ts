import express from "express";
import {
	getUsers,
	createUser,
	updateUser,
	deleteUser,
	addUserToGroup,
	removeUserFromGroup,
	regeneratePassword,
} from "../controllers/userController";
import { protect, adminOnly } from "../middleware/auth";

const router = express.Router();

// Most user management restricted to admin
router.get("/", protect, getUsers); // Maybe allow all auth users to see list? Or admin only.
router.post("/", protect, adminOnly, createUser);
router.put("/:id", protect, adminOnly, updateUser);
router.delete("/:id", protect, adminOnly, deleteUser);
router.post("/:id/regenerate_password", protect, adminOnly, regeneratePassword);

// Group membership
router.post("/:userId/groups/:groupId", protect, adminOnly, addUserToGroup);
router.delete(
	"/:userId/groups/:groupId",
	protect,
	adminOnly,
	removeUserFromGroup,
);

// Note: routes inside groups usually are for group resources, but here we do operations ON users relating to groups.
// The frontend might expect /groups/:id/users/:userId which is handled in group routes or here.
// Checking api.ts:
// addUserToGroup: async (groupId, userId) => api.post(`groups/${groupId}/users/${userId}`)
// So we need to add these to groupRoutes.ts actually? Or handle in index.ts
// Let's check api.ts again:
// addUserToGroup: api.post(`groups/${groupId}/users/${userId}`)
// removeUserFromGroup: api.delete(`groups/${groupId}/users/${userId}`)
// Correct place is groupRoutes.ts for those paths.
// But we implemented logic in userController. Let's export it from there and use in groupRoutes.

export default router;
