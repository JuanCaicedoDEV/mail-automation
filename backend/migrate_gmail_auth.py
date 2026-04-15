import asyncio
import asyncpg
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/dbname")

async def run_migration():
    print(f"Connecting to {DATABASE_URL}")
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # Create gmail_credentials table
        print("Creating table 'gmail_credentials'...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS gmail_credentials (
                id SERIAL PRIMARY KEY,
                user_email TEXT UNIQUE NOT NULL,
                refresh_token TEXT NOT NULL,
                access_token TEXT,
                token_expiry TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)
        print("Table 'gmail_credentials' created successfully.")

    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run_migration())
