"""SQLite audit log for agent requests."""

from __future__ import annotations

import json
import time
from pathlib import Path

import aiosqlite

DB_PATH = Path(__file__).resolve().parent / "audit.db"


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL NOT NULL,
                method TEXT NOT NULL,
                url TEXT NOT NULL,
                private INTEGER NOT NULL DEFAULT 1,
                status_code INTEGER,
                circuit TEXT,
                response_summary TEXT,
                tx_hash TEXT
            )
        """)
        await db.commit()


async def log_request(
    method: str,
    url: str,
    private: bool,
    status_code: int | None = None,
    circuit: list[str] | None = None,
    response_summary: str | None = None,
    tx_hash: str | None = None,
):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO audit_log
               (timestamp, method, url, private, status_code, circuit, response_summary, tx_hash)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                time.time(),
                method,
                url,
                1 if private else 0,
                status_code,
                json.dumps(circuit) if circuit else None,
                response_summary,
                tx_hash,
            ),
        )
        await db.commit()


async def get_logs(limit: int = 100) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
