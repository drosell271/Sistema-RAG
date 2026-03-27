import { Request, Response } from "express";
import User from "../models/User";
import Settings from "../models/Settings";
import bcrypt from "bcryptjs";
import { mailService } from "../services/mailService";

export const getUsers = async (req: Request, res: Response) => {
	try {
		const users = await User.find().select("-password_hash");
		res.json(users);
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const createUser = async (req: Request, res: Response) => {
	try {
		const { name, lastname, email, password, role, group_ids } = req.body;

		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res.status(400).json({ detail: "Email already registered" });
		}

		// Generate random password if not provided
		let finalPassword = password;
		if (!finalPassword) {
			finalPassword =
				Math.random().toString(36).slice(-8) +
				Math.random().toString(36).slice(-8);
		}

		const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || "10");
		const salt = await bcrypt.genSalt(saltRounds);
		const password_hash = await bcrypt.hash(finalPassword, salt);

		const newUser = new User({
			name,
			lastname,
			email,
			password_hash,
			role: role || "standard",
			group_ids: group_ids || [],
		});

		const savedUser = await newUser.save();
		const userObj: any = savedUser.toObject();
		delete userObj.password_hash;

		// Send Welcome Email
		try {
			const frontendUrlSetting = await Settings.findOne({
				key: "FRONTEND_URL",
			});
			const frontendUrl =
				frontendUrlSetting?.value || process.env.FRONTEND_URL || "";
			const loginLink = `${frontendUrl}/login`;

			await mailService.sendWelcomeEmail(
				savedUser.name,
				savedUser.email,
				finalPassword,
				loginLink,
			);
		} catch (error) {
			console.error("[User] Failed to send welcome email:", error);
		}

		res.json(userObj);
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const updateUser = async (req: Request, res: Response) => {
	try {
		const { id } = req.params;
		const changes = req.body;

		// Prevent updating password via this route if desired, or handle hashing if incl.
		if (changes.password) {
			const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || "10");
			const salt = await bcrypt.genSalt(saltRounds);
			changes.password_hash = await bcrypt.hash(changes.password, salt);
			delete changes.password;
		}

		const updatedUser = await User.findByIdAndUpdate(id, changes, {
			new: true,
		}).select("-password_hash");

		if (!updatedUser) {
			return res.status(404).json({ detail: "User not found" });
		}
		res.json(updatedUser);
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const deleteUser = async (req: Request, res: Response) => {
	try {
		const { id } = req.params;
		await User.findByIdAndDelete(id);
		res.json({ status: "success" });
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

// Also needed for group management
export const addUserToGroup = async (req: Request, res: Response) => {
	// Logic to add group_id to user.group_ids
	// For simplicity, frontend often updates user.group_ids via updateUser,
	// but direct endpoint is nice.
	try {
		const { groupId, userId } = req.params;
		await User.findByIdAndUpdate(userId, {
			$addToSet: { group_ids: groupId },
		});
		res.json({ status: "success" });
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const removeUserFromGroup = async (req: Request, res: Response) => {
	try {
		const { groupId, userId } = req.params;
		await User.findByIdAndUpdate(userId, {
			$pull: { group_ids: groupId },
		});
		res.json({ status: "success" });
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const regeneratePassword = async (req: Request, res: Response) => {
	try {
		const { id } = req.params;

		// Generate random password
		const newPassword =
			Math.random().toString(36).slice(-8) +
			Math.random().toString(36).slice(-8);

		const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || "10");
		const salt = await bcrypt.genSalt(saltRounds);
		const password_hash = await bcrypt.hash(newPassword, salt);

		const updatedUser = await User.findByIdAndUpdate(
			id,
			{ password_hash },
			{ new: true },
		);
		if (!updatedUser)
			return res.status(404).json({ detail: "User not found" });

		// Send Email with new password
		try {
			const frontendUrlSetting = await Settings.findOne({
				key: "FRONTEND_URL",
			});
			const frontendUrl =
				frontendUrlSetting?.value || process.env.FRONTEND_URL || "";
			const loginLink = `${frontendUrl}/login`;

			await mailService.sendRegeneratedPasswordEmail(
				updatedUser.name,
				updatedUser.email,
				newPassword,
				loginLink,
			);
		} catch (error) {
			console.error(
				"[User] Failed to send regenerated password email:",
				error,
			);
		}

		// Return the RAW password so admin can give it to user
		res.json({
			message: "Password regenerated",
			password: newPassword,
			email: updatedUser.email,
		});
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};
