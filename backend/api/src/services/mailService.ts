import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import logger from "../config/logger";
import Settings from "../models/Settings";

class MailService {
	private templateCache: Map<string, string> = new Map();

	constructor() {}

	/**
	 * Loads an HTML template from the templates/ folder and replaces {{placeholders}}.
	 * Supports simple {{#if var}}...{{/if}} conditional blocks.
	 * Templates are cached in memory after first load.
	 */
	private loadTemplate(
		templateName: string,
		vars: Record<string, string>,
	): string {
		// Load from cache or disk
		let html = this.templateCache.get(templateName);
		if (!html) {
			const templatePath = path.join(
				__dirname,
				"..",
				"templates",
				`${templateName}.html`,
			);
			try {
				html = fs.readFileSync(templatePath, "utf-8");
				this.templateCache.set(templateName, html);
			} catch (err) {
				logger.error(
					`[MailService] Template '${templateName}' not found at ${templatePath}`,
					err,
				);
				// Return a minimal fallback
				return `<p>${Object.entries(vars)
					.map(([k, v]) => `${k}: ${v}`)
					.join("<br>")}</p>`;
			}
		}

		// Process {{#if var}}...{{/if}} conditional blocks
		html = html.replace(
			/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
			(_, varName, content) => {
				return vars[varName] ? content : "";
			},
		);

		// Replace {{placeholders}}
		for (const [key, value] of Object.entries(vars)) {
			html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
		}

		return html;
	}

	/**
	 * Fetches the APP_NAME from DB Settings, falling back to env then "RAG Platform".
	 */
	private async getAppName(): Promise<string> {
		try {
			const setting = await Settings.findOne({ key: "APP_NAME" });
			if (setting?.value) return setting.value;
		} catch (e) {
			// Ignore, use fallback
		}
		return process.env.APP_NAME || "RAG Platform";
	}

	private async getTransporter() {
		// Fetch settings
		let smtpHost = process.env.SMTP_HOST;
		let smtpPort = process.env.SMTP_PORT || "587";
		let smtpUser = process.env.SMTP_USER;
		let smtpPass = process.env.SMTP_PASSWORD;
		let smtpSecure = process.env.SMTP_SECURE || "false";

		try {
			const settings = await Settings.find({
				key: {
					$in: [
						"SMTP_HOST",
						"SMTP_PORT",
						"SMTP_USER",
						"SMTP_PASSWORD",
						"SMTP_SECURE",
					],
				},
			});

			settings.forEach((s) => {
				if (s.key === "SMTP_HOST") smtpHost = s.value;
				if (s.key === "SMTP_PORT") smtpPort = s.value;
				if (s.key === "SMTP_USER") smtpUser = s.value;
				if (s.key === "SMTP_PASSWORD") smtpPass = s.value;
				if (s.key === "SMTP_SECURE") smtpSecure = s.value;
			});
		} catch (e) {
			logger.error(
				"[MailService] Failed to fetch settings from DB, using env fallback.",
				e,
			);
		}

		if (!smtpHost || !smtpUser) {
			logger.warn(
				"[MailService] SMTP credentials missing! Emails will fail.",
			);
			return null;
		}

		const transporter = nodemailer.createTransport({
			host: smtpHost,
			port: parseInt(smtpPort),
			secure: smtpSecure === "true" || smtpPort === "465",
			auth: {
				user: smtpUser,
				pass: smtpPass,
			},
		});

		return transporter;
	}

	async sendMail(to: string, subject: string, html: string, text: string) {
		const transporter = await this.getTransporter();

		let from = process.env.EMAIL_FROM || "noreply@example.com";
		// Try to fetch FROM setting
		try {
			const s = await Settings.findOne({ key: "EMAIL_FROM" });
			if (s && s.value) from = s.value;
		} catch (e) {}

		if (!transporter) {
			logger.error(
				"[MailService] Transporter not initialized (Missing Config). Cannot send email.",
			);
			throw new Error("SMTP Transporter not ready");
		}

		logger.info(
			`[MailService] Attempting to send email to: ${to} | Subject: ${subject}`,
		);

		try {
			const info = await transporter.sendMail({
				from,
				to,
				subject,
				text,
				html,
			});
			logger.info(`[MailService] Email sent: ${info.messageId}`);
			return info;
		} catch (error) {
			logger.error("[MailService] Error sending email: ", error);
			throw error;
		}
	}

	async sendWelcomeEmail(
		name: string,
		email: string,
		password?: string,
		loginLink?: string,
	) {
		const appName = await this.getAppName();
		const link = loginLink || "http://localhost/login";

		const html = this.loadTemplate("welcome", {
			appName,
			name,
			password: password || "",
			link,
		});

		let text = `Hola ${name},\n\nBienvenido/a a ${appName}! Tu cuenta ha sido creada exitosamente.`;
		if (password) {
			text += `\n\nTu contraseña temporal es: ${password}\n\nInicia sesión en: ${link}`;
		} else {
			text += `\n\nYa puedes iniciar sesión en: ${link}`;
		}
		text += `\n\nSaludos,\nEquipo ${appName}`;

		return this.sendMail(email, `Bienvenido/a a ${appName}`, html, text);
	}

	async sendPasswordReset(email: string, resetLink: string) {
		const appName = await this.getAppName();

		const html = this.loadTemplate("password-reset", {
			appName,
			link: resetLink,
		});

		const text = `Has solicitado restablecer tu contraseña.\n\nHaz clic en el enlace:\n${resetLink}\n\nSi no solicitaste esto, ignora este correo.\nEl enlace expira en 1 hora.`;

		return this.sendMail(
			email,
			"Restablecimiento de Contraseña",
			html,
			text,
		);
	}

	async sendRegeneratedPasswordEmail(
		name: string,
		email: string,
		newPassword: string,
		loginLink?: string,
	) {
		const appName = await this.getAppName();
		const link = loginLink || "http://localhost/login";

		const html = this.loadTemplate("password-regenerated", {
			appName,
			name,
			password: newPassword,
			link,
		});

		const text = `Hola ${name},\n\nTu contraseña en ${appName} ha sido regenerada por un administrador.\n\nTu nueva contraseña es: ${newPassword}\n\nInicia sesión en: ${link}\n\nSaludos,\nEquipo ${appName}`;

		return this.sendMail(email, "Contraseña Regenerada", html, text);
	}
}

export const mailService = new MailService();
