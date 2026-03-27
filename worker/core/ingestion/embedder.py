import os
from typing import List
import logging
from sentence_transformers import SentenceTransformer
from fastembed import SparseTextEmbedding

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Embedder:
    _model_instance = None
    _sparse_model_instance = None

    def __init__(self, model_name: str = None):
        if model_name:
             self.model_name = model_name
        else:
             self.model_name = os.getenv("EMBEDDING_MODEL")
             if not self.model_name:
                 raise ValueError("EMBEDDING_MODEL environment variable must be set.")
        # Lazy loading happens in property or methods to avoid import-time heavy lifting

    @property
    def model(self):
        if Embedder._model_instance is None:
            logger.info(f"Loading embedding model: {self.model_name}...")
            try:
                Embedder._model_instance = SentenceTransformer(self.model_name)
                logger.info("Model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load model: {e}")
                raise e
        return Embedder._model_instance

    @property
    def sparse_model(self):
        if Embedder._sparse_model_instance is None:
            # Default to Multilingual BM42 for cross-language sparse search
            model_name = os.getenv("SPARSE_EMBEDDING_MODEL")
            if not model_name:
                raise ValueError("SPARSE_EMBEDDING_MODEL must be set in .env")
            logger.info(f"Loading sparse embedding model: {model_name}...")
            try:
                Embedder._sparse_model_instance = SparseTextEmbedding(model_name=model_name)
                logger.info("Sparse model loaded.")
            except Exception as e:
                logger.error(f"Failed to load sparse model: {e}")
                raise e
        return Embedder._sparse_model_instance

    def embed_text(self, texts: List[str], prefix: str = "") -> List[List[float]]:
        """
        Generates embeddings locally using sentence-transformers.
        """
        try:
            # Handle Model-Specific Prefixes
            # E5 models REQUIRE "query: " or "passage: "
            # BGE-M3 (and others) typically do NOT use these specific prefixes for dense retrieval.
            
            final_texts = texts
            if "e5" in self.model_name.lower():
                final_texts = [f"{prefix}{t}" for t in texts]
            else:
                # For BGE or others, we ignore the E5-style prefix passed by service.py/tasks.py
                # This ensures we don't accidentally embed "passage: Hello" into BGE.
                final_texts = texts
            
            embeddings = self.model.encode(final_texts, normalize_embeddings=True).tolist()
            return embeddings
            
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            raise e

    def embed_sparse(self, texts: List[str]) -> List[object]:
        """
        Generates sparse embeddings using FastEmbed (Splade).
        Returns list of objects compatible with Qdrant sparse vector input.
        """
        try:
            # list() consumes the generator
            return list(self.sparse_model.embed(texts))
        except Exception as e:
            logger.error(f"Error generating sparse embeddings: {e}")
            raise e
