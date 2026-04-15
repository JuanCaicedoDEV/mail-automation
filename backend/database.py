"""
Async SQLite wrapper that mimics the asyncpg pool API used throughout main.py.

Key conversions applied automatically:
  - $1, $2, $3  →  ?, ?, ?   (positional params)
  - NOW()       →  datetime('now')
  - RETURNING id is supported natively in SQLite 3.35+ (Python 3.11 ships 3.39+)
"""

import re
import logging
import aiosqlite
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

# SQLite schema — equivalent to database/init.sql but without PostgreSQL specifics
_SCHEMA = """
CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    website_url TEXT,
    logo_url TEXT,
    identity_description TEXT,
    brand_dna TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    master_prompt TEXT,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    specific_prompt TEXT,
    image_count INTEGER DEFAULT 1,
    image_urls TEXT DEFAULT '[]',
    caption TEXT,
    status TEXT DEFAULT 'PENDING',
    type TEXT DEFAULT 'POST',
    scheduled_at TEXT,
    input_image_url TEXT,
    use_as_content INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    status TEXT DEFAULT 'PENDING',
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(campaign_id, email)
);

CREATE TABLE IF NOT EXISTS gmail_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT UNIQUE NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    token_expiry TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_campaign_id ON posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
"""


def _convert(query: str) -> str:
    """Convert PostgreSQL query syntax to SQLite syntax."""
    # $1, $2 → ?
    query = re.sub(r'\$\d+', '?', query)
    # NOW() → datetime('now')
    query = re.sub(r'\bNOW\(\)', "datetime('now')", query, flags=re.IGNORECASE)
    return query


def _to_dict(row, description) -> dict:
    return {description[i][0]: row[i] for i in range(len(row))}


class Connection:
    """Thin wrapper around an aiosqlite connection with asyncpg-compatible methods."""

    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def fetchval(self, query: str, *args):
        """Return the first column of the first row (e.g. for RETURNING id)."""
        async with self._db.execute(_convert(query), args) as cur:
            row = await cur.fetchone()
            await self._db.commit()
            return row[0] if row else None

    async def fetchrow(self, query: str, *args):
        """Return the first row as a dict, or None."""
        async with self._db.execute(_convert(query), args) as cur:
            row = await cur.fetchone()
            await self._db.commit()
            if row and cur.description:
                return _to_dict(row, cur.description)
        return None

    async def fetch(self, query: str, *args):
        """Return all rows as a list of dicts."""
        async with self._db.execute(_convert(query), args) as cur:
            rows = await cur.fetchall()
            if rows and cur.description:
                return [_to_dict(r, cur.description) for r in rows]
        return []

    async def execute(self, query: str, *args):
        """Execute a statement and return an asyncpg-style status string."""
        try:
            async with self._db.execute(_convert(query), args) as cur:
                await self._db.commit()
                op = query.strip().split()[0].upper()
                return f"{op} {cur.rowcount}"
        except Exception:
            await self._db.rollback()
            raise


class Pool:
    """Minimal pool facade — SQLite doesn't need connection pooling."""

    def __init__(self, db_path: str):
        self._db_path = db_path

    @asynccontextmanager
    async def acquire(self):
        async with aiosqlite.connect(self._db_path) as db:
            # Enable WAL for better concurrency
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute("PRAGMA foreign_keys=ON")
            yield Connection(db)

    async def close(self):
        pass  # Nothing to close for SQLite


async def create_pool(db_path: str) -> Pool:
    """Create the SQLite DB (if needed), run schema migrations, return Pool."""
    async with aiosqlite.connect(db_path) as db:
        await db.executescript(_SCHEMA)
        await db.commit()
    logger.info(f"SQLite database ready at {db_path}")
    return Pool(db_path)
