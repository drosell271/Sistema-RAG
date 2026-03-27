import os
import logging
from core.ingestion.parser import PDFParser
from core.ingestion.chunker import Chunker
from core.ingestion.embedder import Embedder
from core.ingestion.qdrant_connector import QdrantConnector

logger = logging.getLogger(__name__)

class IngestionService:
    def __init__(self):
        self.parser = PDFParser()
        self.chunker = Chunker()
        self.embedder = Embedder()
        self.qdrant = QdrantConnector()
        # Ensure collection call removed from here to prevent import-time I/O errors
        # self.qdrant.ensure_collection()
        
    def ensure_db_ready(self):
        self.qdrant.ensure_collection()

    async def process_file(self, file_path: str, chunk_config: dict = None, extra_metadata: dict = None, check_cancel_func=None, progress_callback=None):
        """
        Full pipeline for a single file:
        Parse -> Chunk -> Embed -> Upsert
        """
        import asyncio
        logger.info(f"Processing {file_path}...")
        
        # 1. Parse (blocking, run in thread)
        try:
            pages = await asyncio.to_thread(self.parser.extract_text, file_path)
            if check_cancel_func and await check_cancel_func():
                logger.info(f"Processing cancelled for {file_path} after parsing.")
                return 0
        except Exception as e:
            logger.error(f"Failed to parse {file_path}: {e}")
            raise e
            
        return await self._process_content_flow(pages, file_path, chunk_config, extra_metadata, check_cancel_func, progress_callback)

    async def process_text(self, text: str, chunk_config: dict = None, extra_metadata: dict = None, check_cancel_func=None):
        """
        Process raw text (e.g. from an email).
        """
        if not text:
            return 0
        
        # Create a single "page" for the text
        pages = [{"text": text, "page_number": 1}]
        
        return await self._process_content_flow(pages, "raw_text", chunk_config, extra_metadata, check_cancel_func)

    async def _process_content_flow(self, pages, source_identifier, chunk_config, extra_metadata, check_cancel_func, progress_callback=None):
        """
        Internal flow: Chunk -> Embed -> Upsert
        """
        import asyncio
        
        # 2. Chunk (fast, CPU bound but lightweight usually)
        if chunk_config:
            custom_chunker = Chunker(
                chunk_size=chunk_config.get("chunk_size", 800),
                overlap=chunk_config.get("chunk_overlap", 150)
            )
            chunks = custom_chunker.chunk_document(pages)
        else:
            chunks = self.chunker.chunk_document(pages)
            
        if not chunks:
            logger.warning(f"No chunks created for {source_identifier}")
            return 0

        # Inject extra metadata
        if extra_metadata:
            for chunk in chunks:
                chunk.update(extra_metadata)
                
        if check_cancel_func and await check_cancel_func():
             logger.info(f"Processing cancelled for {source_identifier} after chunking.")
             return 0

        # 3. Embed and 4. Upsert in Batches
        BATCH_SIZE = 50
        total_batches = (len(chunks) + BATCH_SIZE - 1) // BATCH_SIZE
        
        for i in range(0, len(chunks), BATCH_SIZE):
            if check_cancel_func and await check_cancel_func():
                logger.info(f"Processing cancelled for {source_identifier} during batch processing.")
                return 0
                
            batch_chunks = chunks[i : i + BATCH_SIZE]
            texts = [c['text'] for c in batch_chunks]
            
            # Embed (blocking, run in thread)
            embeddings = await asyncio.to_thread(self.embedder.embed_text, texts, prefix="passage: ")
            
            # Sparse Embed (blocking, run in thread)
            sparse_embeddings = await asyncio.to_thread(self.embedder.embed_sparse, texts)
            
            # Upsert (I/O bound, client usually async-compatible but using sync client here so run in thread)
            await asyncio.to_thread(self.qdrant.upsert_chunks, batch_chunks, embeddings, sparse_embeddings)
            
            current_batch = i//BATCH_SIZE + 1
            if progress_callback:
                await progress_callback(current_batch, total_batches)

            logger.info(f"Processed batch {current_batch}/{total_batches} for {source_identifier}")

        logger.info(f"Successfully processed {source_identifier} with {len(chunks)} chunks.")
        return len(chunks)

    def delete_document(self, filename: str):
        """
        Deletes all chunks associated with a filename from Qdrant.
        """
        try:
            from qdrant_client.http import models
            
            # Filter by 'filepath' or 'doc_id' in payload
            # In parser.py we used 'filepath'. API uploads might use relative path or filename.
            # We should probably standardize on just the filename for the ID if possible, 
            # or Ensure we query with the exact same path string.
            
            # For this MVP, we assume the filepath in payload ends with the filename
            # OR we match the exact string if we know it.
            
            # Refined approach: Match explicit field 'filepath'
            self.qdrant.client.delete(
                collection_name=self.qdrant.collection_name,
                points_selector=models.FilterSelector(
                    filter=models.Filter(
                        must=[
                            models.FieldCondition(
                                key="filepath",
                                match=models.MatchValue(value=filename)
                            )
                        ]
                    )
                )
            )
            logger.info(f"Deleted vectors for {filename}")
        except Exception as e:
            logger.error(f"Error deleting vectors: {e}")
            raise e
