import asyncio
import asyncpg
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/dbname")

async def run_migration():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # Check if column exists
        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='posts' AND column_name='type';")
        
        if not row:
            print("Adding 'type' column to posts table...")
            await conn.execute("ALTER TABLE posts ADD COLUMN type TEXT DEFAULT 'POST';")
            print("Column 'type' added successfully.")
        else:
            print("Column 'type' already exists.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run_migration())
