import { QdrantClient } from "@qdrant/js-client-rest";
import logger from "../config/logger";

class QdrantService {
	private client: QdrantClient;
	private collectionName: string;
	private vectorSize: number;

	constructor() {
		const url = process.env.QDRANT_URL;
		if (!url) {
			throw new Error("QDRANT_URL must be set in .env");
		}
		const apiKey = process.env.QDRANT_API_KEY;
		this.client = new QdrantClient({ url, apiKey });
		const collectionName = process.env.QDRANT_COLLECTION;
		if (!collectionName) {
			throw new Error("QDRANT_COLLECTION must be set in .env");
		}
		this.collectionName = collectionName;
		const embeddingSize = process.env.EMBEDDING_SIZE;
		if (!embeddingSize) {
			throw new Error("EMBEDDING_SIZE must be set in .env");
		}
		this.vectorSize = parseInt(embeddingSize);
	}

	public async ensureCollection() {
		try {
			const result = await this.client.getCollections();
			const exists = result.collections.some(
				(c) => c.name === this.collectionName,
			);

			if (!exists) {
				logger.info(
					`Creating Qdrant collection: ${this.collectionName}`,
				);
				await this.client.createCollection(this.collectionName, {
					vectors: {
						size: this.vectorSize,
						distance: "Cosine",
					},
					sparse_vectors: {
						"text-sparse": {
							index: {},
						},
					},
				});
			}
		} catch (error) {
			logger.error("Error ensuring Qdrant collection:", error);
			throw error;
		}
	}

	public async resetCollection() {
		try {
			logger.info(`Resetting Qdrant collection: ${this.collectionName}`);

			// Recreate collection is safer than deleting all points for clean state
			await this.client.deleteCollection(this.collectionName);

			await this.client.createCollection(this.collectionName, {
				vectors: {
					size: this.vectorSize,
					distance: "Cosine",
				},
				sparse_vectors: {
					"text-sparse": {
						index: {},
					},
				},
			});

			logger.info("Qdrant collection reset successful.");
		} catch (error) {
			logger.error("Error resetting Qdrant collection:", error);
			throw error;
		}
	}

	public async deleteVectors(docId: string) {
		try {
			// Delete by payload filter
			await this.client.delete(this.collectionName, {
				filter: {
					must: [
						{
							key: "doc_id",
							match: {
								value: docId,
							},
						},
					],
				},
			});
		} catch (error) {
			logger.error(`Error deleting vectors for doc ${docId}:`, error);
			// Don't throw, just log
		}
	}

	public async deleteVectorsBatch(docIds: string[]) {
		try {
			if (docIds.length === 0) return;

			// Delete by payload filter with 'match_any'
			await this.client.delete(this.collectionName, {
				filter: {
					must: [
						{
							key: "doc_id",
							match: {
								any: docIds,
							},
						},
					],
				},
			});
			logger.info(`Deleted vectors for ${docIds.length} documents.`);
		} catch (error) {
			logger.error(`Error deleting vectors batch:`, error);
		}
	}
}

export default new QdrantService();
