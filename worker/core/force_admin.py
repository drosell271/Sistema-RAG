import asyncio
from database import connect_to_mongo, db, close_mongo_connection
import uuid
from datetime import datetime
import os

async def create_admin():
    print("Connecting to DB...")
    await connect_to_mongo()
    
    # db is the wrapper. db.client is the client.
    database = db.client["rag_db"]

    email = os.getenv("FORCE_ADMIN_EMAIL", "admin@example.com")
    password = os.getenv("FORCE_ADMIN_PASSWORD", "change-me")
    password_hash = f"hashed_{password}"
    
    print(f"Checking for user {email}...")
    existing = await database.users.find_one({"email": email})
    
    if existing:
        print("User exists. Updating password...")
        await database.users.update_one(
            {"email": email},
            {"$set": {"password_hash": password_hash, "role": "admin"}}
        )
        print("User updated.")
    else:
        print("Creating new admin user...")
        admin_user = {
            "_id": str(uuid.uuid4()),
            "name": "Admin",
            "lastname": "System",
            "email": email,
            "role": "admin",
            "password_hash": password_hash,
            "created_at": datetime.utcnow(),
            "group_ids": []
        }
        await database.users.insert_one(admin_user)
        print("User created.")
    
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(create_admin())
