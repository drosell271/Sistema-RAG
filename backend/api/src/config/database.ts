import mongoose from "mongoose";

export const connectDB = async () => {
	let retries = 5;
	while (retries > 0) {
		try {
			let mongoURI = process.env.MONGO_URI;

			if (!mongoURI) {
				const user = process.env.MONGO_INITDB_ROOT_USERNAME;
				const pass = process.env.MONGO_INITDB_ROOT_PASSWORD;
				const host = process.env.MONGO_HOST;
				const port = process.env.MONGO_PORT;
				const dbName = process.env.MONGO_DB_NAME;

				if (user && pass) {
					mongoURI = `mongodb://${user}:${pass}@${host}:${port}/${dbName}?authSource=admin`;
				} else {
					mongoURI = `mongodb://${host}:${port}/${dbName}`;
				}
			}

			const maskedURI = mongoURI.replace(/\/\/.*@/, "//***:***@");
			console.log(
				`[MongoDB] Connecting to ${maskedURI} (Attempt ${6 - retries}/5)...`,
			);

			const dbName = process.env.MONGO_DB_NAME;
			if (!dbName) {
				throw new Error("MONGO_DB_NAME must be set in .env");
			}
			const conn = await mongoose.connect(mongoURI, { dbName });
			console.log(`[MongoDB] Connected: ${conn.connection.host}`);
			return; // Success
		} catch (error) {
			console.error(`[MongoDB] Connection failed: ${error}`);
			retries -= 1;
			if (retries === 0) {
				console.error("[MongoDB] Exhausted retries. Exiting.");
				process.exit(1);
			}
			console.log("[MongoDB] Retrying in 5s...");
			await new Promise((res) => setTimeout(res, 5000));
		}
	}
};
