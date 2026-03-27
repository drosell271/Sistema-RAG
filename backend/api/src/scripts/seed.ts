import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User";
import Settings from "../models/Settings";
import bcrypt from "bcryptjs";
import { defaultSettings } from "../config/seed_data";
import { connectDB } from "../config/database";

export const seed = async () => {
	try {
		console.log("🌱 Starting Database Seed...");
		// Connect only if not already connected
		if (mongoose.connection.readyState === 0) {
			await connectDB();
		}

		// 1. Seed Settings
		console.log("⚙️  Seeding Settings...");
		for (const setting of defaultSettings) {
			const existing = await Settings.findOne({ key: setting.key });
			if (!existing) {
				await Settings.create(setting);
				console.log(`   ✅ Created setting: ${setting.key}`);
			} else {
				console.log(`   ⏭️  Skipped setting: ${setting.key} (exists)`);
			}
		}

		// 2. Seed Admin User
		console.log("👤 Seeding Admin User...");
		const adminEmail = process.env.ADMIN_EMAIL;
		const adminPassword = process.env.ADMIN_PASSWORD;
		if (!adminEmail || !adminPassword) {
			console.warn(
				"   ⚠️  ADMIN_EMAIL and ADMIN_PASSWORD not set in .env. Skipping admin seed.",
			);
			console.log("✅ Seed completed successfully!");
			return;
		}
		const adminDomain = process.env.ADMIN_DOMAIN;

		if (adminDomain && !adminEmail.endsWith(`@${adminDomain}`)) {
			console.warn(
				`   ⚠️  SKIPPED: Admin email ${adminEmail} does not match required domain @${adminDomain}`,
			);
		} else {
			const existingAdmin = await User.findOne({ email: adminEmail });
			if (!existingAdmin) {
				const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || "10");
				const salt = await bcrypt.genSalt(saltRounds);
				const password_hash = await bcrypt.hash(adminPassword, salt);

				const newAdmin = new User({
					name: "Admin",
					lastname: "System",
					email: adminEmail,
					password_hash,
					role: "admin",
				});
				await newAdmin.save();
				console.log(`   ✅ Created admin user: ${adminEmail}`);
			} else {
				console.log(
					`   ⏭️  Skipped admin user: ${adminEmail} (exists)`,
				);
			}
		}

		console.log("✅ Seed completed successfully!");
	} catch (error) {
		console.error("❌ Seed failed:", error);
		throw error;
	}
};

// Check if run directly
if (require.main === module) {
	dotenv.config();
	seed()
		.then(() => process.exit(0))
		.catch(() => process.exit(1));
}
