import asyncio
import  os
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
        
        # 1. Create campaigns table
        print("Creating campaigns table...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS campaigns (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                master_prompt TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 2. Add columns to posts table if they don't exist
        print("Updating posts table...")
        
        # Helper to add column safely
        async def add_column(table, col, type_def):
            try:
                await conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {type_def}")
                print(f"Added column {col} to {table}")
            except asyncpg.exceptions.DuplicateColumnError:
                print(f"Column {col} already exists in {table}")

        await add_column("posts", "campaign_id", "INTEGER REFERENCES campaigns(id)")
        await add_column("posts", "specific_prompt", "TEXT")
        await add_column("posts", "image_count", "INTEGER DEFAULT 1")
        await add_column("posts", "image_urls", "JSONB DEFAULT '[]'::jsonb")
        
        # 3. Create Indexes
        print("Creating indexes...")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_posts_campaign_id ON posts(campaign_id);")

        print("Migration complete.")
        await conn.close()
        
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
