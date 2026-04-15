import asyncio
import os
import asyncpg
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/content_db")

async def migrate():
    print(f"Connecting to {DATABASE_URL}...")
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        
        print("Altering posts table...")
        # Make client_url nullable
        await conn.execute("ALTER TABLE posts ALTER COLUMN client_url DROP NOT NULL")
        
        print("Migration complete. client_url is now nullable.")
        await conn.close()
        
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
