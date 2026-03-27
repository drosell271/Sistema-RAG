import os
from motor.motor_asyncio import AsyncIOMotorClient
import logging

logger = logging.getLogger(__name__)

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

class Database:
    client: AsyncIOMotorClient = None

db = Database()

async def connect_to_mongo():
    logger.info(f"Connecting to MongoDB at {MONGO_URI}...")
    db.client = AsyncIOMotorClient(MONGO_URI)
    logger.info("MongoDB connected.")

async def close_mongo_connection():
    if db.client:
        db.client.close()
        logger.info("MongoDB closed.")

def get_database():
    return db.client[DB_NAME]
