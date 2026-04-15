import asyncio
import asyncpg
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@db:5432/content_db")

async def run_migration():
    logger.info("Starting migration to add 'brands' table and 'brand_id' to campaigns...")
    
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        
        # 1. Create brands table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS brands (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                website_url TEXT,
                logo_url TEXT,
                identity_description TEXT,
                brand_dna JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        logger.info("Created 'brands' table.")
        
        # 2. Add brand_id to campaigns if not exists
        # Check if column exists first to avoid error
        row = await conn.fetchrow("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='campaigns' AND column_name='brand_id';
        """)
        
        if not row:
            await conn.execute("""
                ALTER TABLE campaigns 
                ADD COLUMN brand_id INTEGER REFERENCES brands(id);
            """)
            logger.info("Added 'brand_id' column to 'campaigns' table.")
        else:
            logger.info("'brand_id' column already exists in 'campaigns' table.")
            
        await conn.close()
        logger.info("Migration completed successfully.")
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise e

if __name__ == "__main__":
    asyncio.run(run_migration())
