import { Request, Response } from "express";
import Settings from "../models/Settings";

export const getSettings = async (req: Request, res: Response) => {
	try {
		const settings = await Settings.find();
		// Convert array of [{key, value}] to object {key: value} for technical convenience if needed,
		// or just return as is. Frontend seems to expect an object or specific format.
		// Based on api.ts: updateSettings: async (settings: { chunk_size... })
		// Let's return an object.
		const settingsObj: any = {};
		settings.forEach((s) => {
			if (s.key === "DOC_CHUNK_SIZE") {
				settingsObj["chunk_size"] = s.value;
				settingsObj["doc_chunk_size"] = s.value; // Keep both for safety
			} else if (s.key === "DOC_CHUNK_OVERLAP") {
				settingsObj["chunk_overlap"] = s.value;
				settingsObj["doc_chunk_overlap"] = s.value;
			} else {
				settingsObj[s.key.toLowerCase()] = s.value;
			}
		});

		// Inject Defaults from Env if missing in DB
		if (!settingsObj.app_name)
			settingsObj.app_name = process.env.APP_NAME || "RAG Platform";
		if (!settingsObj.theme_color)
			settingsObj.theme_color = process.env.THEME_COLOR || "#2563eb";
		if (!settingsObj.app_logo_url)
			settingsObj.app_logo_url = process.env.APP_LOGO_URL || "";
		if (!settingsObj.max_file_size_mb)
			settingsObj.max_file_size_mb = parseInt(
				process.env.MAX_FILE_SIZE_MB || "50",
			);
		if (!settingsObj.jwt_expires_in)
			settingsObj.jwt_expires_in = process.env.JWT_EXPIRES_IN || "1d";
		if (!settingsObj.frontend_url)
			settingsObj.frontend_url =
				process.env.FRONTEND_URL || "http://localhost";
		if (settingsObj.ignored_email_senders === undefined)
			settingsObj.ignored_email_senders = "";

		// Inject Defaults for Ingestion if missing (Critical for frontend sliders)
		if (settingsObj.chunk_size === undefined)
			settingsObj.chunk_size = parseInt(
				process.env.DOC_CHUNK_SIZE || "800",
			);
		if (settingsObj.chunk_overlap === undefined)
			settingsObj.chunk_overlap = parseInt(
				process.env.DOC_CHUNK_OVERLAP || "150",
			);
		if (settingsObj.pst_chunk_size === undefined)
			settingsObj.pst_chunk_size = parseInt(
				process.env.PST_CHUNK_SIZE || "1500",
			);
		if (settingsObj.pst_chunk_overlap === undefined)
			settingsObj.pst_chunk_overlap = parseInt(
				process.env.PST_CHUNK_OVERLAP || "300",
			);

		// Inject Defaults for Email (SMTP)
		if (!settingsObj.smtp_host)
			settingsObj.smtp_host = process.env.SMTP_HOST || "";
		if (!settingsObj.smtp_port)
			settingsObj.smtp_port = process.env.SMTP_PORT || "587";
		if (!settingsObj.smtp_user)
			settingsObj.smtp_user = process.env.SMTP_USER || "";
		// Do not send password back if not explicitly needed, but for admin form we might need it (or empty if set).
		// For security, maybe just send empty string if set? But user wants to edit it.
		// Let's send it for now as it's an admin panel.
		if (!settingsObj.smtp_password)
			settingsObj.smtp_password = process.env.SMTP_PASSWORD || "";
		if (!settingsObj.smtp_secure)
			settingsObj.smtp_secure = process.env.SMTP_SECURE || "false";
		if (!settingsObj.email_from)
			settingsObj.email_from = process.env.EMAIL_FROM || "noreply@example.com";

		// Inject Defaults for Email (IMAP)
		if (!settingsObj.imap_host)
			settingsObj.imap_host = process.env.IMAP_HOST || "";
		if (!settingsObj.imap_port)
			settingsObj.imap_port = process.env.IMAP_PORT || "993";
		if (!settingsObj.imap_user)
			settingsObj.imap_user = process.env.IMAP_USER || "";
		if (!settingsObj.imap_password)
			settingsObj.imap_password = process.env.IMAP_PASSWORD || "";

		res.json(settingsObj);
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const updateSettings = async (req: Request, res: Response) => {
	try {
		const settings = req.body;
		for (const [key, value] of Object.entries(settings)) {
			let dbKey = key.toUpperCase();
			if (key === "chunk_size") dbKey = "DOC_CHUNK_SIZE";
			if (key === "chunk_overlap") dbKey = "DOC_CHUNK_OVERLAP";
			if (key === "doc_chunk_size") dbKey = "DOC_CHUNK_SIZE";
			if (key === "doc_chunk_overlap") dbKey = "DOC_CHUNK_OVERLAP";
			// Handle PST explicit mapping if it comes in lowercase
			if (key === "pst_chunk_size") dbKey = "PST_CHUNK_SIZE";
			if (key === "pst_chunk_overlap") dbKey = "PST_CHUNK_OVERLAP";

			// Handle Email Mappings (Frontend uses lowercase, DB/Env usually uppercase)
			if (key === "smtp_host") dbKey = "SMTP_HOST";
			if (key === "smtp_port") dbKey = "SMTP_PORT";
			if (key === "smtp_user") dbKey = "SMTP_USER";
			if (key === "smtp_password") dbKey = "SMTP_PASSWORD";
			if (key === "smtp_secure") dbKey = "SMTP_SECURE";
			if (key === "email_from") dbKey = "EMAIL_FROM";

			if (key === "imap_host") dbKey = "IMAP_HOST";
			if (key === "imap_port") dbKey = "IMAP_PORT";
			if (key === "imap_user") dbKey = "IMAP_USER";
			if (key === "imap_password") dbKey = "IMAP_PASSWORD";
			if (key === "frontend_url") dbKey = "FRONTEND_URL";
			if (key === "ignored_email_senders")
				dbKey = "IGNORED_EMAIL_SENDERS";

			await Settings.findOneAndUpdate(
				{ key: dbKey },
				{ value: value },
				{ upsert: true },
			);
		}
		res.json({ status: "success" });
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};
