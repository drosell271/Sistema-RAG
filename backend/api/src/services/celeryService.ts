import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";

class CeleryClient {
	private redis: Redis;
	private queue: string;

	constructor() {
		let redisUrl = process.env.REDIS_URL;
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
			} else {
				redisUrl = `redis://${host}:${port}/0`;
			}
		}

		console.log(
			`[Celery] Connecting to Redis at ${redisUrl.replace(/:[^:@]*@/, ":***@")}...`,
		);

		this.redis = new Redis(redisUrl, {
			retryStrategy: (times) => {
				const delay = Math.min(times * 50, 2000);
				console.log(`[Celery] Redis retry #${times} in ${delay}ms`);
				return delay;
			},
			maxRetriesPerRequest: 3,
		});

		this.redis.on("error", (err) => {
			// Suppress initial connection errors to allow retries without crashing immediately if handled
			console.error("[Celery] Redis Client Error:", err.message);
		});

		this.queue = "celery"; // Default celery queue name
	}

	public async sendTask(
		taskName: string,
		args: any[] = [],
		kwargs: any = {},
	) {
		const taskId = uuidv4();

		// Celery Protocol v2 JSON format
		const message = {
			body: Buffer.from(JSON.stringify([args, kwargs, null])).toString(
				"base64",
			),
			"content-encoding": "utf-8",
			"content-type": "application/json",
			headers: {
				id: taskId,
				task: taskName,
				lang: "py",
				argsrepr: JSON.stringify(args), // Optional for logging
				kwargsrepr: JSON.stringify(kwargs), // Optional for logging
				origin: "node-api",
				retries: 0,
			},
			properties: {
				correlation_id: taskId,
				reply_to: uuidv4(),
				delivery_mode: 2,
				delivery_info: {
					exchange: "",
					routing_key: this.getQueueForTask(taskName),
				},
				body_encoding: "base64",
				delivery_tag: uuidv4(),
			},
		};

		try {
			const targetQueue = this.getQueueForTask(taskName);
			await this.redis.lpush(targetQueue, JSON.stringify(message));
			console.log(
				`[Celery] Task ${taskName} sent to queue ${targetQueue}: ${taskId}`,
			);
			return taskId;
		} catch (error) {
			console.error(`[Celery] Failed to send task: ${error}`);
			throw error;
		}
	}

	public async getAsyncResult(
		taskId: string,
		timeoutMs: number = 30000,
	): Promise<any> {
		const start = Date.now();
		const resultKey = `celery-task-meta-${taskId}`;

		while (Date.now() - start < timeoutMs) {
			const res = await this.redis.get(resultKey);
			if (res) {
				const data = JSON.parse(res);
				if (data.status === "SUCCESS") {
					return data.result;
				} else if (data.status === "FAILURE") {
					throw new Error(data.traceback || "Task failed");
				}
			}
			await new Promise((r) => setTimeout(r, 500));
		}
		throw new Error("Timeout waiting for task result");
	}

	public async setCancelFlag(docId: string) {
		// Set a key that the worker checks to abort
		await this.redis.set(`cancel_${docId}`, "1", "EX", 3600); // Expires in 1h
	}

	private getQueueForTask(taskName: string): string {
		if (taskName === "tasks.generate_query_embedding_task") {
			return "search";
		} else if (
			taskName === "tasks.process_document_task" ||
			taskName === "tasks.process_pst_task"
		) {
			return "ingestion";
		}
		return this.queue; // Default "celery"
	}
}

export const celeryClient = new CeleryClient();
