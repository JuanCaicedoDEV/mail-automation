import asyncio
import asyncpg
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@db:5432/content_db")

async def run_migration():
    logger.info("Starting migration to add 'leads' table...")
    
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        
        # Create leads table
        # We include a status enum or just text for simplicity first
        await conn.execute("""
            DO $$ BEGIN
                CREATE TYPE lead_status AS ENUM ('PENDING', 'SENT', 'FAILED');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS leads (
                id SERIAL PRIMARY KEY,
                campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
                email VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                status lead_status DEFAULT 'PENDING',
                sent_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(campaign_id, email)
            );
        """)
        
        # Add index
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads(campaign_id);
            CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
        """)
        
        logger.info("Migration completed successfully.")
        await conn.close()
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")

if __name__ == "__main__":
    asyncio.run(run_migration())
