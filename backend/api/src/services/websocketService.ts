import WebSocket from "ws";
import logger from "../config/logger";
import Redis from "ioredis";

class WebSocketService {
	private clients: Set<WebSocket> = new Set();
	private static instance: WebSocketService;
	private redisSubscriber: Redis;

	private constructor() {
		// Initialize Redis Subscriber
		let redisUrl = process.env.REDIS_URL;
		const redisOptions: any = {};

		if (!redisUrl) {
			const host = process.env.REDIS_HOST;
			const port = process.env.REDIS_PORT;
			if (!host || !port) {
				throw new Error(
					"REDIS_URL or (REDIS_HOST, REDIS_PORT) must be set in .env",
				);
			}
			const password = process.env.REDIS_PASSWORD;
			if (password) {
				redisUrl = `redis://:${password}@${host}:${port}/0`;
				redisOptions.password = password; // Explicit option backup
			} else {
				redisUrl = `redis://${host}:${port}/0`;
			}
		}

		logger.info(
			`[WebSocketService] Connecting to Redis at ${redisUrl?.replace(/:[^:@]*@/, ":***@")}...`,
		);
		this.redisSubscriber = new Redis(redisUrl, redisOptions);

		this.redisSubscriber.on("error", (err) => {
			logger.error(
				"[WebSocketService] Redis Client Error: %s",
				err.message,
			);
		});

		this.redisSubscriber.subscribe("task_updates", (err, count) => {
			if (err) {
				logger.error(
					"Failed to subscribe to task_updates channel: %o",
					err,
				);
			} else {
				logger.info(
					`Subscribed to ${count} channels. Listening for task updates...`,
				);
			}
		});

		this.redisSubscriber.on("message", (channel, message) => {
			if (channel === "task_updates") {
				console.log(
					`[WebSocketService] Received Redis Msg: ${message}`,
				); // DEBUG
				try {
					const parsed = JSON.parse(message);
					this.broadcast({
						type: "task_update",
						payload: parsed,
					});
				} catch (e) {
					logger.error("Failed to parse Redis message: %s", message);
				}
			}
		});
	}

	public static getInstance(): WebSocketService {
		if (!WebSocketService.instance) {
			WebSocketService.instance = new WebSocketService();
		}
		return WebSocketService.instance;
	}

	public addClient(ws: WebSocket) {
		this.clients.add(ws);
		logger.info(
			`WebSocket client connected. Total clients: ${this.clients.size}`,
		);

		ws.on("close", () => {
			this.clients.delete(ws);
			logger.info(
				`WebSocket client disconnected. Total clients: ${this.clients.size}`,
			);
		});
	}

	public broadcast(message: any) {
		const msgString = JSON.stringify(message);
		this.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(msgString);
			}
		});
	}
}

export default WebSocketService.getInstance();
