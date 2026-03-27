from celery_app import celery_app
from core.ingestion.service import IngestionService
# Import the new PST parser
from core.ingestion.pst_parser import extract_emails_from_pst
import asyncio
import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient
import uuid
import redis
import json
from core.search.ranker import Ranker
from core.ingestion.embedder import Embedder
from core.ingestion.qdrant_connector import QdrantConnector
from qdrant_client.http import models as qmodels
import math

# Multilingual query translation
try:
    from langdetect import detect as detect_language
    from deep_translator import GoogleTranslator
    TRANSLATION_AVAILABLE = True
except ImportError:
    TRANSLATION_AVAILABLE = False

# Setup Logger
logger = logging.getLogger(__name__)
import datetime

# DB Helpers for Worker (Since we are outside FastAPI dependency injection)
# DB Helpers for Worker (Since we are outside FastAPI dependency injection)
mongo_user = os.getenv("MONGO_INITDB_ROOT_USERNAME")
mongo_pass = os.getenv("MONGO_INITDB_ROOT_PASSWORD")
mongo_host = os.getenv("MONGO_HOST")
mongo_port = os.getenv("MONGO_PORT")

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    if not all([mongo_user, mongo_pass, mongo_host, mongo_port]):
        raise ValueError("MONGO_URI or (MONGO_INITDB_ROOT_USERNAME, MONGO_INITDB_ROOT_PASSWORD, MONGO_HOST, MONGO_PORT) must be set in .env")
    MONGO_URI = f"mongodb://{mongo_user}:{mongo_pass}@{mongo_host}:{mongo_port}"

DB_NAME = os.getenv("MONGO_DB_NAME")
if not DB_NAME:
    raise ValueError("MONGO_DB_NAME must be set in .env")

# Redis Configuration
redis_host = os.getenv("REDIS_HOST")
redis_port = os.getenv("REDIS_PORT")
redis_password = os.getenv("REDIS_PASSWORD", "")
REDIS_URL = os.getenv("REDIS_URL")

if not REDIS_URL:
    if redis_password:
        REDIS_URL = f"redis://:{redis_password}@{redis_host}:{redis_port}/0"
    else:
        REDIS_URL = f"redis://{redis_host}:{redis_port}/0"

# Redis Client for PubSub
try:
    redis_client = redis.Redis.from_url(REDIS_URL)
except Exception as e:
    logger.error(f"Failed to connect to Redis: {e}")
    redis_client = None

def publish_progress(doc_id, status, progress, message=""):
    if not redis_client or not doc_id: return
    try:
        payload = {
            "doc_id": doc_id,
            "status": status,
            "progress": progress,
            "message": message
        }
        msg = json.dumps(payload)
        redis_client.publish("task_updates", msg)
        print(f"DEBUG: Published to Redis: {msg}", flush=True) # DEBUG
    except Exception as e:
        logger.error(f"Redis publish error: {e}")

async def get_db():
    client = AsyncIOMotorClient(MONGO_URI)
    return client[DB_NAME]

async def create_log_entry(doc_id, filename, log_type, status, message="", metadata=None):
    """
    Helper to create/update a log entry in the logs collection.
    """
    try:
        db = await get_db()
        log_entry = {
            "doc_id": doc_id,
            "filename": filename,
            "type": log_type,
            "status": status,
            "message": message,
            "metadata": metadata or {},
            "timestamp": datetime.datetime.utcnow()
        }
        # Upsert based on doc_id and type to avoid duplicates if re-processing
        await db.logs.update_one(
            {"doc_id": doc_id, "type": log_type},
            {"$set": log_entry},
            upsert=True
        )
        print(f"DEBUG: Log entry created/updated for {doc_id} ({status})", flush=True)
    except Exception as e:
        logger.error(f"Failed to create log entry: {e}")

# Global singleton for worker process
_ingestion_service = None

@celery_app.task(bind=True, ignore_result=True)
def process_document_task(self, file_path, doc_id, folder_id, chunk_config, extra_metadata):
    """
    Celery task to process a document.
    Executes async ingestion service within a sync worker.
    """
    print(f"DEBUG: Starting process_document_task for {doc_id}", flush=True)

    
    async def _async_wrapper():
        global _ingestion_service
        db = await get_db()
        
        # Lazy initialization of the heavy service (loads model once per worker process)
        if _ingestion_service is None:
            logger.info("Initializing IngestionService (Loading Model)...")
            _ingestion_service = IngestionService()
            logger.info("IngestionService initialized.")
            
        service = _ingestion_service
        service.ensure_db_ready()
        
        try:
            # Update status to Processing
            await db.documents.update_one(
                {"_id": doc_id}, 
                {"$set": {"status": "Processing"}}
            )
            
            async def on_progress(curr, total):
                # Update Celery State
                self.update_state(state='PROGRESS', meta={
                    'current': curr,
                    'total': total,
                    'message': f'Procesando lote {curr}/{total}'
                })
                # Publish to Redis
                prog = int((curr / total) * 100) if total > 0 else 0
                publish_progress(doc_id, "processing", prog, f"Procesando chunk {curr}/{total}")
            
            # Run Process
            
            # LOG START
            await create_log_entry(doc_id, extra_metadata.get('filename', 'unknown'), 'file', 'processing', 'Processing started', extra_metadata)

            if extra_metadata and extra_metadata.get("source") == "email_imap":
                # Special handling for emails: Clean reply chains
                try:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        raw_text = f.read()
                    
                    from core.ingestion.email_cleaner import clean_email_text
                    cleaned_text = clean_email_text(raw_text)
                    
                    logger.info(f"Cleaned email text for {doc_id} (Length: {len(raw_text)} -> {len(cleaned_text)})")
                    
                    num_chunks = await service.process_text(
                        cleaned_text,
                        chunk_config=chunk_config,
                        extra_metadata=extra_metadata
                    )
                except Exception as e:
                    logger.error(f"Failed to clean/process email text: {e}")
                    # Fallback to standard processing
                    num_chunks = await service.process_file(
                        file_path,
                        chunk_config=chunk_config,
                        extra_metadata=extra_metadata,
                        progress_callback=on_progress
                    )
            else:
                num_chunks = await service.process_file(
                    file_path,
                    chunk_config=chunk_config,
                    extra_metadata=extra_metadata,
                    progress_callback=on_progress
                )
            
            # Update status to Indexed
            await db.documents.update_one(
                {"_id": doc_id}, 
                {"$set": {"status": f"Indexed ({num_chunks} chunks)"}}
            )
            
            publish_progress(doc_id, "completed", 100, "Procesamiento completado")
            
            # LOG SUCCESS
            await create_log_entry(doc_id, extra_metadata.get('filename', 'unknown'), 'file', 'completed', f'Indexed {num_chunks} chunks', extra_metadata)
            
            # Move Email on Server if applicable
            if extra_metadata and extra_metadata.get("source") == "email_imap" and extra_metadata.get("email_id"):
                try:
                    from core.ingestion.email_ingestor import EmailIngestor

                    email_config = {}
                    settings_cursor = db.settings.find({
                        "key": {"$in": ["IMAP_HOST", "IMAP_PORT", "IMAP_USER", "IMAP_PASSWORD"]}
                    })
                    async for doc in settings_cursor:
                        email_config[doc["key"]] = doc["value"]
                        
                    ingestor = EmailIngestor(config=email_config)
                    email_id = extra_metadata["email_id"]
                    success = ingestor.move_email_to_processed(email_id)
                    if success:
                        logger.info(f"Successfully tracked and moved email ID {email_id} to PROCESSED.")
                    else:
                        logger.error(f"Failed to move email ID {email_id} to PROCESSED.")
                except Exception as ex:
                    logger.error(f"Error while attempting to move email {email_id} to PROCESSED: {ex}")

            # Helper: Update Parent Job Progress (for PST tracking)
            if extra_metadata and "parent_job_id" in extra_metadata:
                try:
                    p_job_id = extra_metadata["parent_job_id"]
                    # Atomically increment counter
                    processed_count = redis_client.incr(f"job_{p_job_id}_processed")
                    total_count_val = redis_client.get(f"job_{p_job_id}_total")
                    
                    if total_count_val:
                        total_count = int(total_count_val)
                        if total_count > 0:
                            pct = int((processed_count / total_count) * 100)
                            publish_progress(p_job_id, "processing", pct, f"Procesando emails {processed_count}/{total_count}")
                            
                            if processed_count >= total_count:
                                publish_progress(p_job_id, "completed", 100, "Todos los emails procesados")
                                # Expire keys
                                redis_client.expire(f"job_{p_job_id}_processed", 3600)
                                redis_client.expire(f"job_{p_job_id}_total", 3600)
                except Exception as redis_err:
                    logger.error(f"Failed to update parent job progress: {redis_err}")
            
            return {"status": "Complete", "chunks": num_chunks}
            
        except Exception as e:
            logger.error(f"Task failed for {doc_id}: {e}")
            await db.documents.update_one(
                {"_id": doc_id}, 
                {"$set": {"status": "Failed"}}
            )
            publish_progress(doc_id, "error", 0, str(e))
            
            # LOG FAILURE
            await create_log_entry(doc_id, extra_metadata.get('filename', 'unknown'), 'file', 'failed', str(e), extra_metadata)

            # Update Parent Job Progress on Failure as well
            if extra_metadata and "parent_job_id" in extra_metadata:
                try:
                    p_job_id = extra_metadata["parent_job_id"]
                    processed_count = redis_client.incr(f"job_{p_job_id}_processed")
                    total_count_val = redis_client.get(f"job_{p_job_id}_total")
                    
                    if total_count_val and int(total_count_val) > 0:
                        total_count = int(total_count_val)
                        pct = int((processed_count / total_count) * 100)
                        
                        # Use 'processing' status even if this one failed, as the Batch is still running
                        # But if we are done, mark completed.
                        if processed_count >= total_count:
                            publish_progress(p_job_id, "completed", 100, f"Procesamiento finalizado (con errores)")
                            redis_client.expire(f"job_{p_job_id}_processed", 3600)
                            redis_client.expire(f"job_{p_job_id}_total", 3600)
                        else:
                            publish_progress(p_job_id, "processing", pct, f"Procesando emails {processed_count}/{total_count}")
                except Exception as redis_err:
                    logger.error(f"Failed to update parent job progress (error path): {redis_err}")

            raise e

    # Execute Async Logic in Sync Worker
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    return loop.run_until_complete(_async_wrapper())

@celery_app.task(bind=True, time_limit=86400, soft_time_limit=86400, ignore_result=True)
def process_pst_task(self, file_path, job_id, folder_id, chunk_config):
    """
    Celery task to process a PST file.
    1. Extract emails
    2. Create Document for each email
    3. Dispatch process_document_task for each email (PARALLEL)
    """
    async def _async_wrapper():
        db = await get_db()
        
        # NOTE: We don't need IngestionService here anymore for the heavy lifting,
        # just for extraction if needed, but extraction is in pst_parser.
        
        total_emails = 0
        
        try:
            self.update_state(state='PROGRESS', meta={
                'current': 0,
                'total': 0,
                'message': 'Extrayendo correos...'
            })
            publish_progress(job_id, "processing", 0, "Extrayendo correos del PST...")

            # LOG PST START
            await create_log_entry(job_id, os.path.basename(file_path), 'pst', 'processing', 'Extracting emails...', {'file_path': file_path})

            emails_gen = extract_emails_from_pst(file_path)
            
            # Batch Preparation
            documents_batch = []
            files_to_dispatch = []
            
            # Get ignored senders config for PST
            ignored_senders = []
            try:
                ignored_config = await db.settings.find_one({"key": "IGNORED_EMAIL_SENDERS"})
                if ignored_config and ignored_config.get("value"):
                    ignored_senders = [s.strip().lower() for s in ignored_config["value"].split(",") if s.strip()]
                if ignored_senders:
                    logger.info(f"Loaded ignored senders for PST: {ignored_senders}")
            except Exception as e:
                logger.error(f"Failed to load ignored senders for PST: {e}")

            # Ensure docs dir
            DOCS_DIR = os.getenv("DOCS_DIR")
            if not DOCS_DIR:
                raise ValueError("DOCS_DIR must be set in .env")
            DOCS_DIR = os.path.abspath(DOCS_DIR)
            
            import re
            
            for email in emails_gen:
                sender_email = email['sender'].lower()
                if ignored_senders:
                    is_ignored = False
                    for ignored in ignored_senders:
                        if ignored in sender_email:
                            is_ignored = True
                            break
                    if is_ignored:
                        logger.info(f"PST skipped ignored sender: {email['sender']}")
                        continue

                total_emails += 1
                
                doc_id = str(uuid.uuid4())
                subject_clean = email['subject'].replace('/', '-').replace('\\', '-')[:100]
                filename = f"{subject_clean}.txt"
                
                # Sanitize filename
                filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
                stored_filename = f"{doc_id}_{filename}"
                
                final_path = os.path.join(DOCS_DIR, stored_filename)
                
                try:
                    with open(final_path, 'w', encoding='utf-8') as f:
                        f.write(f"Subject: {email['subject']}\n")
                        f.write(f"From: {email['sender']}\n")
                        f.write(f"Date: {email['date']}\n\n")
                        f.write(email['content'])
                except Exception as write_err:
                    logger.error(f"Failed to write email file {filename}: {write_err}")
                    continue

                new_doc = {
                    "_id": doc_id,
                    "filename": filename,
                    "stored_filename": stored_filename,
                    "folder_id": folder_id,
                    "size": len(email['content']),
                    "status": "Processing",
                    "type": "email",
                    "upload_date": email['date'],
                    "metadata": {
                        "sender": email['sender'],
                        "original_folder": email['original_folder']
                    }
                }
                
                documents_batch.append(new_doc)
                files_to_dispatch.append({
                    "path": final_path, 
                    "doc_id": doc_id, 
                    "folder_id": folder_id, 
                    "filename": filename,
                    "sender": email['sender']
                })
                
                # Check cancellation (polling every 50 extracts)
                if total_emails % 50 == 0:
                    publish_progress(job_id, "processing", 0, f"Extrayendo correos... ({total_emails} encontrados)")
                    if redis_client and redis_client.exists(f"cancel_{job_id}"):
                         publish_progress(job_id, "cancelled", 0, "Procesamiento cancelado")
                         return {"status": "Cancelled"}

            publish_progress(job_id, "processing", 10, f"Se encontraron {total_emails} correos. Iniciando procesamiento paralelo...")

            # Batch Insert into Mongo
            if documents_batch:
                await db.documents.insert_many(documents_batch)
                logger.info(f"Batch inserted {len(documents_batch)} email records to Mongo.")
            
            if total_emails == 0:
                 publish_progress(job_id, "completed", 100, "No se encontraron correos en el PST.")
                 return {"status": "Empty"}

            if not files_to_dispatch:
                 publish_progress(job_id, "error", 100, "Se encontraron correos pero falló la extracción de todos.")
                 return {"status": "FailedAll"}

            # Initialize Progress Tracking in Redis for the PARENT job
            # FIX: Use len(files_to_dispatch) instead of total_emails to account for skipped/failed writes
            valid_total = len(files_to_dispatch)
            
            if redis_client:
                redis_client.set(f"job_{job_id}_total", valid_total)
                redis_client.set(f"job_{job_id}_processed", 0)
                # Set expire to avoid zombie keys
                redis_client.expire(f"job_{job_id}_total", 86400)
                redis_client.expire(f"job_{job_id}_processed", 86400)

            # Dispatch Tasks
            logger.info(f"Dispatching {len(files_to_dispatch)} tasks for PST {job_id}")
            
            for item in files_to_dispatch:
                process_document_task.delay(
                    item["path"],
                    item["doc_id"],
                    item["folder_id"],
                    chunk_config,
                    extra_metadata={
                        "doc_id": item["doc_id"],
                        "folder_id": item["folder_id"],
                        "filename": item["filename"],
                        "sender": item["sender"],
                        "parent_job_id": job_id  # <--- Critical for progress tracking
                    }
                )

            # Cleanup PST
            if os.path.exists(file_path):
                 try:
                    os.remove(file_path)
                 except Exception:
                    pass
            
            # NOTE: We do NOT mark the job as 'completed' here locally, 
            # because the child tasks will update the progress bar to 100%.
            # But the Celery task itself finishes now.
            
            return {"status": "Dispatched", "emails_count": total_emails}
            
            # LOG PST SUCCESS (Dispatched)
            await create_log_entry(job_id, os.path.basename(file_path), 'pst', 'completed', f'Dispatched {total_emails} emails', {'total_emails': total_emails})

        except Exception as e:
            logger.error(f"PST Task failed: {e}")
            publish_progress(job_id, "error", 0, str(e))
            
            # LOG PST FAILURE
            await create_log_entry(job_id, os.path.basename(file_path), 'pst', 'failed', str(e), {})

            raise e

    # Async loop runner
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    return loop.run_until_complete(_async_wrapper())

@celery_app.task(bind=True)
def generate_query_embedding_task(self, query_text):
    """
    Celery task to generate embedding for a search query.
    Used to keep the API lightweight.
    """
    try:
        # Lazy load embedder
        from core.ingestion.embedder import Embedder
        embedder = Embedder()
        
        # Generate embedding
        # e5 models: "query: " for search queries
        embedding = embedder.embed_text([query_text], prefix="query: ")[0]
        
        return {"embedding": embedding}
    except Exception as e:
        logger.error(f"Query embedding failed: {e}")
        raise e

@celery_app.task(bind=True)
def check_email_inbox(self):
    """
    Periodic task to check IMAP inbox for new emails.
    """
    try:
        from core.ingestion.email_ingestor import EmailIngestor
        from pymongo import MongoClient

        # Fetch settings and ensure Mails folder
        email_config = {}
        chunk_settings = {"size": os.getenv("DOC_CHUNK_SIZE", "1000"), "overlap": os.getenv("DOC_CHUNK_OVERLAP", "200")}
        folder_id = None
        
        try:
            client = MongoClient(MONGO_URI)
            db = client[DB_NAME]
            settings_col = db.settings
            folders_col = db.folders
            
            # 1. Settings
            cursor = settings_col.find({
                "key": {"$in": ["IMAP_HOST", "IMAP_PORT", "IMAP_USER", "IMAP_PASSWORD", "DOC_CHUNK_SIZE", "DOC_CHUNK_OVERLAP", "IGNORED_EMAIL_SENDERS"]}
            })
            
            for doc in cursor:
                if doc["key"] in ["DOC_CHUNK_SIZE", "DOC_CHUNK_OVERLAP"]:
                    key_map = {"DOC_CHUNK_SIZE": "size", "DOC_CHUNK_OVERLAP": "overlap"}
                    chunk_settings[key_map[doc["key"]]] = doc["value"]
                else:
                    email_config[doc["key"]] = doc["value"]

            # 2. Get/Create "Mails" folder
            mails_folder = folders_col.find_one({"name": "Mails", "parent_id": None})
            if mails_folder:
                folder_id = str(mails_folder["_id"])
            else:
                new_folder = {
                    "name": "Mails",
                    "parent_id": None,
                    "created_at": datetime.datetime.utcnow(),
                    "is_public": False,
                    "allowed_group_ids": []
                }
                res = folders_col.insert_one(new_folder)
                folder_id = str(res.inserted_id)
                logger.info(f"Created 'Mails' folder ID: {folder_id}")
                
            client.close()
        except Exception as e:
            logger.error(f"Failed to fetch settings/folders from Mongo: {e}")
            # Fallback to empty dict -> Ingestor uses env vars
            
        ingestor = EmailIngestor(config=email_config)
        new_emails = ingestor.process_inbox()
        
        if not new_emails:
            return "No new emails"

        logger.info(f"Dispatching tasks for {len(new_emails)} new emails to folder {folder_id}")
        
        # Dispatch processing tasks
        # Chunk settings are now fetched from DB with env var / hardcoded defaults
        try:
            chunk_size = int(chunk_settings["size"])
            chunk_overlap = int(chunk_settings["overlap"])
        except (ValueError, TypeError):
            chunk_size = 1000
            chunk_overlap = 200
            
        chunk_config = {"chunk_size": chunk_size, "overlap": chunk_overlap}
        
        try:
            client = MongoClient(MONGO_URI)
            db = client[DB_NAME]
            
            for email_data in new_emails:
                 doc_id = email_data["doc_id"]
                 filename = email_data["filename"]
                 
                 # 1. Insert into DB so frontend can see it
                 new_doc = {
                     "_id": doc_id,
                     "filename": filename,
                     "stored_filename": f"{doc_id}_{filename}",
                     "folder_id": folder_id,
                     "size": 0, # Cannot know size before reading file, we rely on the processor if needed or just 0
                     "status": "Processing",
                     "type": "email",
                     "upload_date": datetime.datetime.utcnow().isoformat(),
                     "metadata": {
                         "sender": email_data["sender"],
                         "subject": email_data["subject"]
                     }
                 }
                 try:
                     db.documents.insert_one(new_doc)
                 except Exception as insert_err:
                     logger.error(f"Failed to insert email doc into DB: {insert_err}")
                     # proceed anyway so it gets processed
                 
                 # 2. Dispatch task
                 process_document_task.delay(
                    email_data["file_path"],
                    doc_id,
                    folder_id, # Use the Mails folder ID
                    chunk_config,
                    extra_metadata={
                        "doc_id": doc_id,
                        "filename": filename,
                        "sender": email_data["sender"],
                        "subject": email_data["subject"],
                        "source": "email_imap",
                        "email_id": email_data.get("email_id")
                    }
                 )
                 
            client.close()
        except Exception as mongo_err:
             logger.error(f"MongoDB connection failed during email dispatch: {mongo_err}")
             raise mongo_err
             
        return f"Dispatched {len(new_emails)} emails to folder {folder_id}"
        
    except Exception as e:
        logger.error(f"Check email task failed: {e}")
        return f"Failed: {e}"

def _translate_query(query):
    """
    Detects query language and translates to enable cross-language search.
    Returns (original_query, translated_query) or (original_query, None) if translation fails.
    Uses deep-translator's GoogleTranslator (free, no API key needed).
    """
    if not TRANSLATION_AVAILABLE:
        logger.warning("Translation libraries not available. Skipping query translation.")
        return query, None
    
    try:
        detected_lang = detect_language(query)
        logger.info(f"Detected query language: {detected_lang} for query: '{query}'")
        
        if detected_lang == 'en':
            # English query -> translate to Spanish
            translated = GoogleTranslator(source='en', target='es').translate(query)
        elif detected_lang == 'es':
            # Spanish query -> translate to English
            translated = GoogleTranslator(source='es', target='en').translate(query)
        else:
            # Other language -> translate to both English and Spanish, use English
            translated = GoogleTranslator(source='auto', target='en').translate(query)
        
        if translated and translated.strip() and translated.lower().strip() != query.lower().strip():
            logger.info(f"Translated query: '{query}' -> '{translated}'")
            return query, translated
        else:
            logger.info(f"Translation identical or empty, skipping.")
            return query, None
            
    except Exception as e:
        logger.warning(f"Query translation failed (non-critical): {e}")
        return query, None


def _search_and_collect(connector, embedder, query_text, fetch_limit, qdrant_filter):
    """
    Runs hybrid search (dense + sparse) for a single query and returns candidate dicts.
    """
    query_vector = embedder.embed_text([query_text], prefix="query: ")[0]
    query_sparse_vector = list(embedder.embed_sparse([query_text]))[0]
    
    candidates = connector.search(
        query_vector=query_vector,
        query_sparse_vector=query_sparse_vector,
        limit=fetch_limit,
        query_filter=qdrant_filter,
        score_threshold=None  # No threshold for hybrid search
    )
    
    candidate_list = []
    for cand in candidates:
        payload = getattr(cand, "payload", {}) or {}
        score = getattr(cand, "score", 0)
        doc_id = getattr(cand, "id", "")
        candidate_list.append({
            "id": doc_id,
            "score": score,
            "text": payload.get("text", ""),
            "payload": payload
        })
    
    return candidate_list


@celery_app.task(bind=True)
def perform_advanced_search_task(self, query, limit=10, filters=None, rerank=True, score_threshold=0.6):
    """
    Advanced Search: Embedding -> Retrieval -> Reranking
    Supports multilingual queries via automatic translation.
    """
    try:
        print(f"DEBUG: Advanced Search Task - Query: {query}, Limit: {limit}, Rerank: {rerank}, Threshold: {score_threshold}", flush=True)

        # 1. Translate query for cross-language search
        original_query, translated_query = _translate_query(query)
        
        if translated_query:
            print(f"DEBUG: Multilingual search - Original: '{original_query}', Translated: '{translated_query}'", flush=True)

        # 2. Build Qdrant Filter
        qdrant_filter = None
        if filters:
            must_conditions = []
            if filters.get("folder_id"):
                must_conditions.append(
                    qmodels.FieldCondition(
                        key="folder_id",
                        match=qmodels.MatchValue(value=filters["folder_id"])
                    )
                )
            elif filters.get("folder_ids"):
                must_conditions.append(
                    qmodels.FieldCondition(
                        key="folder_id",
                        match=qmodels.MatchAny(any=filters["folder_ids"])
                    )
                )
            if filters.get("type"):
                must_conditions.append(
                    qmodels.FieldCondition(
                        key="type",
                        match=qmodels.MatchValue(value=filters["type"])
                    )
                )
            # Basic sender filter
            if filters.get("sender"):
                must_conditions.append(
                    qmodels.FieldCondition(
                        key="sender",
                        match=qmodels.MatchValue(value=filters["sender"])
                    )
                )
            
            if must_conditions:
                qdrant_filter = qmodels.Filter(must=must_conditions)

        # 3. Retrieve Candidates using dual queries
        embedder = Embedder()
        connector = QdrantConnector()
        fetch_limit = 50 if rerank else limit
        
        # Search with original query
        candidate_list = _search_and_collect(connector, embedder, original_query, fetch_limit, qdrant_filter)
        print(f"DEBUG: Original query returned {len(candidate_list)} candidates", flush=True)
        
        # Search with translated query and merge results
        if translated_query:
            translated_candidates = _search_and_collect(connector, embedder, translated_query, fetch_limit, qdrant_filter)
            print(f"DEBUG: Translated query returned {len(translated_candidates)} candidates", flush=True)
            
            # Merge: deduplicate by point ID, keep highest score
            seen_ids = {c["id"]: c for c in candidate_list}
            for tc in translated_candidates:
                existing = seen_ids.get(tc["id"])
                if existing is None:
                    candidate_list.append(tc)
                    seen_ids[tc["id"]] = tc
                elif tc["score"] > existing["score"]:
                    # Update score if translated query scored higher
                    existing["score"] = tc["score"]
            
            print(f"DEBUG: Merged candidate set: {len(candidate_list)} unique candidates", flush=True)
            
        # 4. Re-Rank (using ORIGINAL query — the reranker is multilingual)
        if rerank and candidate_list:
            ranker = Ranker()
            reranked_results = ranker.rerank(original_query, candidate_list, top_k=limit)
            
            # Filter by threshold (Sigmoid of logit)
            final_results = []
            for res in reranked_results:
                score = res.get('score', 0)
                # Sigmoid with overflow protection
                try:
                    prob = 1 / (1 + math.exp(-score))
                except OverflowError:
                    prob = 0.0 if score < 0 else 1.0
                
                print(f"DEBUG: Doc {res.get('id')} Score: {score} -> Prob: {prob} (Threshold: {score_threshold})", flush=True)

                if prob >= score_threshold:
                    final_results.append(res)
                    
        else:
            final_results = candidate_list[:limit]
            
        return final_results

    except Exception as e:
        logger.error(f"Advanced search failed: {e}")
        raise e
