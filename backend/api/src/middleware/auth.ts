import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
	user?: any;
}

export const protect = (
	req: AuthRequest,
	res: Response,
	next: NextFunction,
) => {
	let token;

	if (
		req.headers.authorization &&
		req.headers.authorization.startsWith("Bearer")
	) {
		token = req.headers.authorization.split(" ")[1];
	} else if (req.query && req.query.token) {
		token = req.query.token as string;
	}

	if (!token) {
		return res.status(401).json({ detail: "Not authorized, no token" });
	}

	try {
		const secretKey = process.env.SECRET_KEY;
		if (!secretKey) {
			return res
				.status(500)
				.json({ detail: "SECRET_KEY not configured" });
		}
		const decoded = jwt.verify(token, secretKey);
		req.user = decoded;
		next();
	} catch (error) {
		console.error("Auth Token Error:", error);
		res.status(401).json({ detail: "Not authorized, token failed" });
	}
};

export const adminOnly = (
	req: AuthRequest,
	res: Response,
	next: NextFunction,
) => {
	if (req.user && req.user.role === "admin") {
		next();
	} else {
		res.status(403).json({ detail: "Admin access required" });
	}
};
