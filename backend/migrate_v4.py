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
        print("Migrating v4: Adding post type enum and column...")
        
        # 1. Create Enum Type if not exists
        try:
            await conn.execute("CREATE TYPE post_type AS ENUM ('POST', 'STORY', 'REEL');")
        except asyncpg.DuplicateObjectError:
            print("Enum post_type already exists.")
        except Exception as e:
            # Postgres sometimes throws distinct errors for existing types depending on version
            print(f"Notice on enum creation: {e}")

        # 2. Add column
        try:
            await conn.execute("""
                ALTER TABLE posts 
                ADD COLUMN IF NOT EXISTS type post_type DEFAULT 'POST';
            """)
            print("Column 'type' added to posts table.")
        except Exception as e:
            print(f"Error adding column: {e}")

    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
