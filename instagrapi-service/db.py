import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(os.getenv("INSTAGRAPI_DB_PATH", "/data/feed.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _add_column_if_missing(conn: sqlite3.Connection, table: str, column: str, coltype: str) -> bool:
    """Returns True if the column was just added (so callers can backfill it)."""
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column in existing:
        return False
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")
    return True


def _backfill_post_user_ids(conn: sqlite3.Connection) -> None:
    rows = conn.execute("SELECT session_id, media_id, user_json FROM posts WHERE user_id IS NULL").fetchall()
    conn.executemany(
        "UPDATE posts SET user_id = ? WHERE session_id = ? AND media_id = ?",
        [(json.loads(user_json)["pk"], session_id, media_id) for session_id, media_id, user_json in rows],
    )


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS posts (
                session_id TEXT NOT NULL,
                media_id TEXT NOT NULL,
                taken_at REAL NOT NULL,
                media_json TEXT NOT NULL,
                user_json TEXT NOT NULL,
                fetched_at REAL NOT NULL,
                PRIMARY KEY (session_id, media_id)
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_posts_session_taken_at ON posts (session_id, taken_at DESC)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS poll_rotation (
                session_id TEXT NOT NULL,
                followed_user_id TEXT NOT NULL,
                username TEXT,
                last_checked_at REAL NOT NULL DEFAULT 0,
                PRIMARY KEY (session_id, followed_user_id)
            )
            """
        )
        # Added after the initial schema — migrate existing installs in place.
        if _add_column_if_missing(conn, "posts", "user_id", "TEXT"):
            _backfill_post_user_ids(conn)
        _add_column_if_missing(conn, "poll_rotation", "profile_pic_url", "TEXT")
        _add_column_if_missing(conn, "poll_rotation", "is_close_friend", "INTEGER NOT NULL DEFAULT 0")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_posts_session_user ON posts (session_id, user_id)")


def upsert_posts(session_id: str, items: list[dict[str, Any]]) -> None:
    """Each item is {"media": <instagrapi Media>, "user": <instagrapi UserShort>}. Deduped by media_id — polling the same account repeatedly just re-inserts posts already seen, harmlessly."""
    rows = [
        (
            session_id,
            item["media"].id,
            item["media"].taken_at.timestamp(),
            item["media"].model_dump_json(),
            item["user"].model_dump_json(),
            item["user"].pk,
            time.time(),
        )
        for item in items
    ]
    if not rows:
        return
    with _connect() as conn:
        conn.executemany(
            """
            INSERT OR IGNORE INTO posts (session_id, media_id, taken_at, media_json, user_json, user_id, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )


def get_posts(session_id: str, since: Optional[float] = None) -> list[dict[str, Any]]:
    with _connect() as conn:
        if since is not None:
            rows = conn.execute(
                "SELECT media_json, user_json FROM posts WHERE session_id = ? AND taken_at >= ? ORDER BY taken_at DESC",
                (session_id, since),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT media_json, user_json FROM posts WHERE session_id = ? ORDER BY taken_at DESC",
                (session_id,),
            ).fetchall()
    return [{"media": json.loads(media_json), "user": json.loads(user_json)} for media_json, user_json in rows]


def get_latest_post_dates(session_id: str) -> dict[str, float]:
    """Most recent stored post's taken_at per followed account, for showing content freshness (distinct from last_checked_at, which is when we last asked Instagram, not how recent what we got back was)."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT user_id, MAX(taken_at) FROM posts WHERE session_id = ? AND user_id IS NOT NULL GROUP BY user_id",
            (session_id,),
        ).fetchall()
    return {row[0]: row[1] for row in rows}


def get_accounts_to_poll(session_id: str, following: dict[str, Any], limit: int) -> list[tuple[str, Any]]:
    """Picks the `limit` least-recently-checked accounts to poll this tick, using the same rotation algorithm either way:

    - If any accounts are marked as close friends, polling is scoped to ONLY
      that list — the whole point of close friends is to poll a small,
      curated set instead of everyone followed.
    - Otherwise, falls back to the full following list, as before.
    """
    with _connect() as conn:
        conn.executemany(
            """
            INSERT INTO poll_rotation (session_id, followed_user_id, username, profile_pic_url, last_checked_at)
            VALUES (?, ?, ?, ?, 0)
            ON CONFLICT (session_id, followed_user_id)
            DO UPDATE SET username = excluded.username, profile_pic_url = excluded.profile_pic_url
            """,
            [
                (session_id, user_id, user_short.username, str(user_short.profile_pic_url or ""))
                for user_id, user_short in following.items()
            ],
        )

        close_friend_rows = conn.execute(
            "SELECT followed_user_id FROM poll_rotation WHERE session_id = ? AND is_close_friend = 1",
            (session_id,),
        ).fetchall()
        close_friend_ids = {row[0] for row in close_friend_rows}

        candidate_ids = (
            [user_id for user_id in following.keys() if user_id in close_friend_ids]
            if close_friend_ids
            else list(following.keys())
        )
        if not candidate_ids:
            return []

        placeholders = ",".join("?" for _ in candidate_ids)
        rows = conn.execute(
            f"""
            SELECT followed_user_id FROM poll_rotation
            WHERE session_id = ? AND followed_user_id IN ({placeholders})
            ORDER BY last_checked_at ASC
            LIMIT ?
            """,
            (session_id, *candidate_ids, limit),
        ).fetchall()
    return [(row[0], following[row[0]]) for row in rows if row[0] in following]


def get_rotation_status(session_id: str) -> list[dict[str, Any]]:
    """Every followed account the poller knows about for this session, and when it was last actually checked — least-recently-checked (most overdue) first."""
    latest_posts = get_latest_post_dates(session_id)
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT followed_user_id, username, profile_pic_url, last_checked_at, is_close_friend FROM poll_rotation
            WHERE session_id = ?
            ORDER BY last_checked_at ASC
            """,
            (session_id,),
        ).fetchall()
    return [
        {
            "user_id": row[0],
            "username": row[1],
            "profile_pic_url": row[2] or None,
            "last_checked_at": row[3] or None,
            "latest_post_at": latest_posts.get(row[0]),
            "is_close_friend": bool(row[4]),
        }
        for row in rows
    ]


def set_close_friend(session_id: str, followed_user_id: str, is_close_friend: bool) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE poll_rotation SET is_close_friend = ? WHERE session_id = ? AND followed_user_id = ?",
            (1 if is_close_friend else 0, session_id, followed_user_id),
        )


def mark_checked(session_id: str, followed_user_id: str) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE poll_rotation SET last_checked_at = ? WHERE session_id = ? AND followed_user_id = ?",
            (time.time(), session_id, followed_user_id),
        )
