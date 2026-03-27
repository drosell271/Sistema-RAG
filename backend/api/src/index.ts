import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import expressWs from "express-ws";
import { connectDB } from "./config/database";

dotenv.config();

const { app } = expressWs(express());
const PORT = process.env.PORT;
if (!PORT) {
	throw new Error("PORT must be set in .env");
}

// Middleware
const allowedOriginsRaw = process.env.ALLOWED_ORIGINS;
if (!allowedOriginsRaw) {
	throw new Error("ALLOWED_ORIGINS must be set in .env");
}
const allowedOrigins = allowedOriginsRaw.split(",");
app.use(
	cors({
		origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
	}),
);
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

// Database
connectDB().then(async () => {
	// Run Seed (Idempotent)
	try {
		const { seed } = await import("./scripts/seed");
		await seed();
	} catch (error) {
		console.error("Failed to run seed on startup:", error);
	}

	import("./config/init").then(({ initializeSystem }) => {
		initializeSystem();
	});
});

// Route Imports
import authRoutes from "./routes/authRoutes";
import documentRoutes from "./routes/documentRoutes";
import searchRoutes from "./routes/searchRoutes";
import settingsRoutes from "./routes/settingsRoutes";
import folderRoutes from "./routes/folderRoutes";
import groupRoutes from "./routes/groupRoutes";
import userRoutes from "./routes/userRoutes";
import emailRoutes from "./routes/emailRoutes";
import logRoutes from "./routes/logRoutes";

// WebSocket health endpoint (frontend expects it at /api/ws)
import websocketService from "./services/websocketService";

app.ws("/api/ws", (ws) => {
	websocketService.addClient(ws); // Register client

	// Initial Health Check
	ws.send(JSON.stringify({ type: "health", payload: { status: "alive" } }));

	const interval = setInterval(() => {
		if (ws.readyState === 1) {
			ws.send(
				JSON.stringify({
					type: "health",
					payload: { status: "alive" },
				}),
			);
		}
	}, 30000); // 30s heartbeat

	ws.on("close", () => clearInterval(interval));
});

// Common Router for versioned API
const apiV1 = express.Router();
apiV1.use("/auth", authRoutes);
apiV1.use("/documents", documentRoutes);
apiV1.use("/search", searchRoutes);
apiV1.use("/settings", settingsRoutes);
apiV1.use("/folders", folderRoutes);
apiV1.use("/groups", groupRoutes);
apiV1.use("/users", userRoutes);
apiV1.use("/email", emailRoutes);
apiV1.use("/logs", logRoutes);

// Mount with both /api and /api/v1 for maximum compatibility with current frontend
app.use("/api/v1", apiV1);
app.use("/api", apiV1);

app.get("/api/v1/health", (req, res) => {
	res.json({ status: "ok", service: "rag-platform-api-node" });
});

app.get("/api/health", (req, res) => {
	res.json({ status: "ok", service: "rag-platform-api-node" });
});

app.get("/", (req, res) => {
	res.send("RAG Platform API (Node.js)");
});

app.listen(PORT, () => {
	// Dynamic import to avoid circular dependency if logger uses env vars loaded here
	import("./config/logger").then(({ default: logger }) => {
		logger.info(`Server running on port ${PORT}`);
	});
});
