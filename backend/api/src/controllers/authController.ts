import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import Settings from "../models/Settings";
import { mailService } from "../services/mailService";

// Helper to generate hash (mirrors Python's simple "hashed_" prefix if we want backward compat or use bcrypt real)
// User wanted to "delete old code", so we should standardize on bcrypt now.
// BUT if existing users have "hashed_password", bcrypt will fail.
// Strategy: Check if starts with "hashed_", if so, plain compare, else bcrypt.

const comparePassword = async (
	candidate: string,
	hash: string,
): Promise<boolean> => {
	if (hash.startsWith("hashed_")) {
		return `hashed_${candidate}` === hash;
	}
	return bcrypt.compare(candidate, hash);
};

export const register = async (req: Request, res: Response) => {
	try {
		const { name, lastname, email, password } = req.body;

		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res.status(400).json({ detail: "Email already registered" });
		}

		// Hash password
		const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || "10");
		const salt = await bcrypt.genSalt(saltRounds);
		const password_hash = await bcrypt.hash(password, salt);

		const newUser = new User({
			name,
			lastname,
			email,
			password_hash,
		});

		const savedUser = await newUser.save();

		// Send Welcome Email
		try {
			const frontendUrlSetting = await Settings.findOne({
				key: "FRONTEND_URL",
			});
			const frontendUrl =
				frontendUrlSetting?.value ||
				process.env.FRONTEND_URL ||
				"http://localhost";
			const loginLink = `${frontendUrl}/login`;

			await mailService.sendWelcomeEmail(
				savedUser.name,
				savedUser.email,
				password,
				loginLink,
			);
		} catch (error) {
			console.error("[Auth] Failed to send welcome email:", error);
			// Do not fail registration if email fails
		}

		res.json({
			id: savedUser._id,
			name: savedUser.name,
			email: savedUser.email,
			role: savedUser.role,
		});
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const login = async (req: Request, res: Response) => {
	try {
		const { username, password } = req.body; // 'username' is email in OAuth2 form data usually, or JSON
		// Support both JSON { email, password } and Form { username, password }
		const email = username || req.body.email;

		const user = await User.findOne({ email });
		if (!user) {
			return res.status(400).json({ detail: "Invalid credentials" });
		}

		const isMatch = await comparePassword(password, user.password_hash);
		if (!isMatch) {
			return res.status(400).json({ detail: "Invalid credentials" });
		}

		// Create Token
		const payload = {
			sub: user.email,
			role: user.role,
			user_id: user._id,
		};

		const jwtSecret = process.env.SECRET_KEY || "secret";

		// Fetch JWT Expiry from Settings (Dynamic)
		const jwtSetting = await Settings.findOne({ key: "JWT_EXPIRES_IN" });
		const jwtExpiry =
			jwtSetting?.value || process.env.JWT_EXPIRES_IN || "1d";

		const signOptions: jwt.SignOptions = {
			expiresIn: jwtExpiry as any,
		};
		const token = jwt.sign(payload, jwtSecret, signOptions);

		res.json({
			token: token,
			user: {
				id: user._id,
				name: user.name,
				lastname: user.lastname,
				email: user.email,
				role: user.role,
				group_ids: user.group_ids,
				created_at: user.created_at,
			},
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ detail: "Server Error" });
	}
};

export const getMe = async (req: Request | any, res: Response) => {
	try {
		// Assume middleware sets req.user
		const userId = req.user?.user_id;
		const user = await User.findById(userId).select("-password_hash");
		if (!user) {
			return res.status(404).json({ detail: "User not found" });
		}
		res.json(user);
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const forgotPassword = async (req: Request, res: Response) => {
	try {
		const { email } = req.body;
		const user = await User.findOne({ email });
		if (!user) {
			// Do not reveal user existence
			return res.json({ message: "If email exists, reset link sent." });
		}

		// Generate Reset Token (Stateless)
		const jwtSecret = process.env.SECRET_KEY || "secret";
		// 1 hour expiry
		const token = jwt.sign({ sub: user.email, type: "reset" }, jwtSecret, {
			expiresIn: "1h",
		});

		// Log Link for Dev
		const frontendUrlSetting = await Settings.findOne({
			key: "FRONTEND_URL",
		});
		const frontendUrl =
			frontendUrlSetting?.value ||
			process.env.FRONTEND_URL ||
			"http://localhost";
		const resetLink = `${frontendUrl}/reset-password?token=${token}`;

		console.log(`[Auth] Password Reset Link for ${email}: ${resetLink}`);

		// Send Email
		try {
			await mailService.sendPasswordReset(email, resetLink);
		} catch (error) {
			console.error("[Auth] Failed to send reset email:", error);
			return res.status(500).json({ detail: "Failed to send email" });
		}

		res.json({ message: "If email exists, reset link sent." });
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const resetPassword = async (req: Request, res: Response) => {
	try {
		const { token, new_password } = req.body;
		if (!token || !new_password) {
			return res.status(400).json({ detail: "Missing fields" });
		}

		const jwtSecret = process.env.SECRET_KEY || "secret";
		let decoded: any;
		try {
			decoded = jwt.verify(token, jwtSecret);
		} catch (e) {
			return res.status(400).json({ detail: "Invalid or expired token" });
		}

		if (decoded.type !== "reset") {
			return res.status(400).json({ detail: "Invalid token type" });
		}

		const user = await User.findOne({ email: decoded.sub });
		if (!user) {
			return res.status(404).json({ detail: "User not found" });
		}

		const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || "10");
		const salt = await bcrypt.genSalt(saltRounds);
		user.password_hash = await bcrypt.hash(new_password, salt);
		await user.save();

		res.json({ message: "Password reset successful" });
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};
