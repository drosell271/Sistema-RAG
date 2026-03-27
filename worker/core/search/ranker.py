import os
import logging
from sentence_transformers import CrossEncoder

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Ranker:
    _model_instance = None

    def __init__(self, model_name: str = None):
        # Default to multilingual model for cross-language reranking
        if not model_name:
            model_name = os.getenv("RERANKER_MODEL")
            if not model_name:
                raise ValueError("RERANKER_MODEL must be set in .env")
        self.model_name = model_name

    @property
    def model(self):
        if Ranker._model_instance is None:
            logger.info(f"Loading reranker model: {self.model_name}...")
            try:
                Ranker._model_instance = CrossEncoder(self.model_name)
                logger.info("Reranker model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load reranker model: {e}")
                raise e
        return Ranker._model_instance

    def rerank(self, query: str, candidates: list, top_k: int = 10):
        """
        Reranks a list of candidate documents based on the query.
        candidates: List of dicts, must have 'text' and 'id/payload' presumably.
                    Actually, we expect a list of objects or dicts. 
                    Let's assume candidates are dicts with 'text' field.
        """
        if not candidates:
            return []

        # Prepare pairs [query, doc_text]
        pairs = []
        for doc in candidates:
            # Handle different formats: doc could be Qdrant Point or dict
            text = doc.get('text', "")
            if not text:
                # Try getting from payload if it's a Qdrant dict structure
                payload = doc.get('payload', {})
                if payload:
                    text = payload.get('text', "")
            
            pairs.append([query, text])

        try:
            scores = self.model.predict(pairs)
            
            # Combine doc with score
            scored_candidates = []
            for i, doc in enumerate(candidates):
                scored_candidates.append({
                    "doc": doc,
                    "score": float(scores[i]),
                    "original_score": doc.get('score', 0)
                })

            # Sort by score descending
            scored_candidates.sort(key=lambda x: x['score'], reverse=True)

            # Return Top-K
            return scored_candidates[:top_k]
            
        except Exception as e:
            logger.error(f"Reranking failed: {e}")
            # Fallback: Return original candidates sorted by original score if possible
            return candidates[:top_k]
