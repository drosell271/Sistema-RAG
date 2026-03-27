import os
import logging
from celery import Celery
from celery.signals import worker_init

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get Redis URL from env or build it
REDIS_URL = os.getenv("REDIS_URL")
if not REDIS_URL:
    redis_host = os.getenv("REDIS_HOST")
    redis_port = os.getenv("REDIS_PORT")
    if not redis_host or not redis_port:
        raise ValueError("REDIS_URL or (REDIS_HOST, REDIS_PORT) must be set in .env")
    redis_password = os.getenv("REDIS_PASSWORD", "")
    if redis_password:
        REDIS_URL = f"redis://:{redis_password}@{redis_host}:{redis_port}/0"
    else:
        REDIS_URL = f"redis://{redis_host}:{redis_port}/0"

celery_app = Celery(
    "rag_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=['tasks']
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600, # 1 hour timeout per file
    beat_schedule={
        "check-email-every-5-mins": {
            "task": "tasks.check_email_inbox",
            "schedule": float(os.getenv("IMAP_POLL_INTERVAL", "300")), 
        },
    },
)


@worker_init.connect
def preload_model(sender=None, **kwargs):
    """Preload embedding model at worker startup.

    Uses a Redis lock so only one worker downloads the model.
    Others wait for the lock to release, then load from cache.
    """
    import redis
    import time
    from core.ingestion.embedder import Embedder

    model_name = os.getenv("EMBEDDING_MODEL")
    if not model_name:
        raise ValueError("EMBEDDING_MODEL environment variable is not set. Please configure it in your .env file.")
        
    lock_key = f"model_download_lock:{model_name}"
    
    # Helper to load model
    def load_model_safe():
        logger.info(f"[Preload] Instantiating Embedder for {model_name}...")
        try:
            embedder = Embedder(model_name)
            _ = embedder.model  # triggers download + load
            logger.info("[Preload] Model loaded and ready.")
        except Exception as e:
            logger.error(f"[Preload] Failed to load model: {e}")
            raise e

    try:
        r = redis.from_url(REDIS_URL)
        # Check if already loaded/downloaded by checking a simpler flag? 
        # Relying on lock is safe.
        
        # Acquire lock with a timeout (e.g., 20 minutes for slow connections)
        # blocked_timeout ensures we wait for the other worker to finish.
        lock = r.lock(lock_key, timeout=1200, blocking_timeout=1200)
        
        logger.info("[Preload] Attempting to acquire lock for model download...")
        
        # blocking=True means we wait here until we get the lock
        if lock.acquire(blocking=True):
            try:
                logger.info(f"[Preload] Lock acquired. Checking/Downloading model: {model_name}")
                load_model_safe()
            finally:
                # Release lock so others can proceed (and find it in cache)
                logger.info("[Preload] Releasing lock.")
                lock.release()
        else:
            # This block is reached only if blocking_timeout expires (failed to acquire)
            logger.warning("[Preload] Could not acquire lock within timeout. Attempting load anyway (hoping it's ready)...")
            load_model_safe()

    except redis.exceptions.ConnectionError:
        logger.warning("[Preload] Redis not available for locking. Proceeding with potential concurrent download.")
        load_model_safe()
    except Exception as e:
        logger.error(f"[Preload] Unexpected error during preload: {e}")
        # We don't raise here to avoid crashing the worker completely, 
        # but the first task might fail.


