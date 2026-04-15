import asyncio
import asyncpg
import os

async def migrate():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not set")
        return

    conn = await asyncpg.connect(database_url)
    try:
        print("Migrating v5: Creating brands table and relationships...")
        
        # 1. Create brands table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS brands (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                website_url TEXT,
                logo_url TEXT,
                identity_description TEXT,
                brand_dna JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        print("Table 'brands' created.")

        # 2. Add brand_id to campaigns
        try:
            await conn.execute("""
                ALTER TABLE campaigns 
                ADD COLUMN IF NOT EXISTS brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL;
            """)
            print("Column 'brand_id' added to campaigns table.")
        except Exception as e:
            print(f"Error adding column brand_id: {e}")

        # 3. Create index for performance
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_campaigns_brand_id ON campaigns(brand_id);
        """)
        print("Index created.")

    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
