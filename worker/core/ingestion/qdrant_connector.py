from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import Distance, VectorParams, SparseVectorParams, SparseIndexParams
import logging
import os
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class QdrantConnector:
    def __init__(self):
        self.url = os.getenv("QDRANT_URL")
        self.host = os.getenv("QDRANT_HOST")
        self.port = int(os.getenv("QDRANT_PORT", "0"))
        self.collection_name = os.getenv("QDRANT_COLLECTION")
        if not self.host or not self.port or not self.collection_name:
            raise ValueError("QDRANT_HOST, QDRANT_PORT, and QDRANT_COLLECTION must be set in .env")
        
        self.vector_size = os.getenv("EMBEDDING_SIZE")
        if not self.vector_size:
             raise ValueError("EMBEDDING_SIZE environment variable is not set.")
        self.vector_size = int(self.vector_size)

        self.api_key = os.getenv("QDRANT_API_KEY")
        
        if self.url:
            logger.info(f"Connecting to Qdrant at {self.url}...")
            self.client = QdrantClient(url=self.url, api_key=self.api_key)
        else:
            logger.info(f"Connecting to Qdrant at {self.host}:{self.port} (plain HTTP)...")
            # Explicitly disable HTTPS to avoid implicit upgrade due to api_key
            self.client = QdrantClient(host=self.host, port=self.port, api_key=self.api_key, https=False)

    def ensure_collection(self):
        """Creates collection if it doesn't exist."""
        try:
            collections = self.client.get_collections()
            exists = any(c.name == self.collection_name for c in collections.collections)
            
            # Check if collection exists and has correct config
            if exists:
                collection_info = self.client.get_collection(self.collection_name)
                
                # Check if sparse vector config exists
                has_sparse = False
                if hasattr(collection_info.config.params, 'sparse_vectors') and collection_info.config.params.sparse_vectors:
                    if 'text-sparse' in collection_info.config.params.sparse_vectors:
                        has_sparse = True
                
                if not has_sparse:
                    logger.warning(f"Collection '{self.collection_name}' exists but missing 'text-sparse' vector. Re-creating...")
                    self.client.delete_collection(self.collection_name)
                    exists = False
            
            if not exists:
                logger.info(f"Creating collection '{self.collection_name}' with dense and sparse vectors...")
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config={
                        "": models.VectorParams(
                            size=self.vector_size,
                            distance=models.Distance.COSINE
                        )
                    },
                    sparse_vectors_config={
                        "text-sparse": models.SparseVectorParams(
                            index=models.SparseIndexParams(
                                on_disk=False,
                            )
                        )
                    }
                )
                logger.info("Collection created.")
            else:
                logger.info(f"Collection '{self.collection_name}' already exists.")
                
        except Exception as e:
            logger.error(f"Error ensuring collection: {e}")
            raise

        # Ensure Payload Index for "text" field (Full Text Search)
        try:
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="text",
                field_schema=models.TextIndexParams(
                    type="text",
                    tokenizer=models.TokenizerType.WORD,
                    min_token_len=2,
                    max_token_len=15,
                    lowercase=True
                )
            )
            logger.info("Payload index for 'text' ensured.")
        except Exception as e:
            # It might fail if already exists or other error, just log warning
            logger.warning(f"Could not create payload index for 'text' (might already exist): {e}")

    def upsert_chunks(self, chunks: list, embeddings: list, sparse_embeddings: list = None):
        """
        Upserts chunks with embeddings to Qdrant.
        chunks: list of dicts (metadata)
        embeddings: list of dense vectors
        sparse_embeddings: list of sparse vectors (optional)
        """
        points = []
        for i, chunk in enumerate(chunks):
            # Generate deterministic ID
            c_id = chunk.get('chunk_id')
            if not c_id:
                 c_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, chunk.get('text', '')[:100]))
            
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, c_id))
            
            dense_vec = embeddings[i]
            
            if sparse_embeddings:
                sp = sparse_embeddings[i]
                # Default vector must be named "" if we are using a dictionary for vectors
                vector = {
                    "": dense_vec,
                    "text-sparse": models.SparseVector(
                        indices=sp.indices.tolist(),
                        values=sp.values.tolist()
                    )
                }
            else:
                vector = dense_vec
            
            points.append(models.PointStruct(
                id=point_id,
                vector=vector,
                payload=chunk
            ))
            
        if points:
            try:
                self.client.upsert(
                    collection_name=self.collection_name,
                    points=points
                )
                logger.info(f"Upserted {len(points)} chunks.")
            except Exception as e:
                logger.error(f"Failed to upsert chunks: {e}")
                raise e

    def count_vectors(self, filename: str) -> int:
        """Returns number of vectors for a given filename."""
        try:
            from qdrant_client.http import models
            count_result = self.client.count(
                collection_name=self.collection_name,
                count_filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="filepath",
                            match=models.MatchValue(value=filename)
                        )
                    ]
                )
            )
            return count_result.count
        except Exception as e:
            logger.error(f"Error counting vectors: {e}")
            return 0


    def search(self, query_vector: list, limit: int = 10, query_filter = None, score_threshold: float = None, query_sparse_vector = None):
        """Searches for similar vectors using raw point query. Supports Hybrid Search (Fusion) if sparse vector provided."""
        try:
            if query_sparse_vector:
                # RRF Fusion
                response = self.client.query_points(
                    collection_name=self.collection_name,
                    prefetch=[
                        models.Prefetch(
                            query=query_vector,
                            filter=query_filter,
                            limit=limit * 5 # Get more candidates for fusion
                        ),
                        models.Prefetch(
                            query=models.SparseVector(
                                indices=query_sparse_vector.indices.tolist(),
                                values=query_sparse_vector.values.tolist()
                            ),
                            using="text-sparse",
                            filter=query_filter,
                            limit=limit * 5
                        )
                    ],
                    query=models.FusionQuery(fusion=models.Fusion.RRF),
                    limit=limit,
                )
            else:
                # Normal Search
                response = self.client.query_points(
                    collection_name=self.collection_name,
                    query=query_vector,
                    limit=limit,
                    query_filter=query_filter,
                    score_threshold=score_threshold
                )
            
            # Helper to extract points
            if hasattr(response, 'points'):
                return response.points
            return response
            
        except Exception as e:
            logger.error(f"Error searching Qdrant: {e}")
            raise e
