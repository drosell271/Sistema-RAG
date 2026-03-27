import logger from "./logger";
import qdrantService from "../services/qdrantService";

export const initializeSystem = async () => {
	try {
		// 1. Ensure Qdrant Collection Exists
		await qdrantService.ensureCollection();
		logger.info("[Init] Qdrant collection verified/created.");
	} catch (error) {
		logger.error("[Init] System initialization failed:", error);
	}
};
