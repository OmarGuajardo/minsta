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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS profile_cache (
                session_id TEXT PRIMARY KEY,
                profile_json TEXT NOT NULL,
                fetched_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS poll_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                started_at REAL NOT NULL,
                finished_at REAL NOT NULL,
                checked_usernames TEXT NOT NULL,
                posts_fetched INTEGER NOT NULL,
                requests_used INTEGER NOT NULL,
                status TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT ''
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_poll_history_session ON poll_history (session_id, id DESC)")
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


def get_posts(session_id: str, since: Optional[float] = None, user_id: Optional[str] = None) -> list[dict[str, Any]]:
    """`user_id`, when given, scopes to a single account's posts — used to
    read back just-your-own posts (see /profile/posts) from the same table
    that /feed reads the whole followed-accounts timeline from."""
    query = "SELECT media_json, user_json FROM posts WHERE session_id = ?"
    params: list[Any] = [session_id]
    if user_id is not None:
        query += " AND user_id = ?"
        params.append(user_id)
    if since is not None:
        query += " AND taken_at >= ?"
        params.append(since)
    query += " ORDER BY taken_at DESC"
    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()
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


def record_poll_run(
    session_id: str,
    started_at: float,
    finished_at: float,
    checked_usernames: list[str],
    posts_fetched: int,
    requests_used: int,
    status: str,
    detail: str = "",
) -> None:
    """Logs one full poller tick for /jobs to show "what the previous run
    did" — keeps only the most recent 20 runs per session, since this is
    diagnostic history, not data anything else depends on."""
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO poll_history
                (session_id, started_at, finished_at, checked_usernames, posts_fetched, requests_used, status, detail)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, started_at, finished_at, json.dumps(checked_usernames), posts_fetched, requests_used, status, detail),
        )
        conn.execute(
            """
            DELETE FROM poll_history
            WHERE session_id = ? AND id NOT IN (
                SELECT id FROM poll_history WHERE session_id = ? ORDER BY id DESC LIMIT 20
            )
            """,
            (session_id, session_id),
        )


def get_last_poll_run(session_id: str) -> Optional[dict[str, Any]]:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT started_at, finished_at, checked_usernames, posts_fetched, requests_used, status, detail
            FROM poll_history WHERE session_id = ? ORDER BY id DESC LIMIT 1
            """,
            (session_id,),
        ).fetchone()
    if row is None:
        return None
    return {
        "started_at": row[0],
        "finished_at": row[1],
        "checked_usernames": json.loads(row[2]),
        "posts_fetched": row[3],
        "requests_used": row[4],
        "status": row[5],
        "detail": row[6],
    }


def get_upcoming_poll_preview(session_id: str, limit: int) -> list[str]:
    """Predicts the next tick's candidate accounts (same least-recently-
    checked ordering as get_accounts_to_poll, close-friends-aware), read
    from the already-synced rotation cache — no live Instagram call needed
    just to preview what's coming up next."""
    with _connect() as conn:
        close_friend_rows = conn.execute(
            "SELECT followed_user_id FROM poll_rotation WHERE session_id = ? AND is_close_friend = 1",
            (session_id,),
        ).fetchall()
        close_friend_ids = {row[0] for row in close_friend_rows}

        if close_friend_ids:
            placeholders = ",".join("?" for _ in close_friend_ids)
            rows = conn.execute(
                f"""
                SELECT username, followed_user_id FROM poll_rotation
                WHERE session_id = ? AND followed_user_id IN ({placeholders})
                ORDER BY last_checked_at ASC LIMIT ?
                """,
                (session_id, *close_friend_ids, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT username, followed_user_id FROM poll_rotation
                WHERE session_id = ? ORDER BY last_checked_at ASC LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()
    return [row[0] or row[1] for row in rows]


def get_cached_profile(session_id: str) -> Optional[dict[str, Any]]:
    """Own profile, read from cache — populated on first view and refreshed
    on-demand (see main.py's /profile), not by the background poller. Profile
    fields change far less often than the feed, so unlike posts there's no
    proactive rotation, just cache-until-asked-to-refresh."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT profile_json, fetched_at FROM profile_cache WHERE session_id = ?", (session_id,)
        ).fetchone()
    if row is None:
        return None
    profile = json.loads(row[0])
    profile["fetched_at"] = row[1]
    return profile


def save_profile(session_id: str, profile: dict[str, Any]) -> dict[str, Any]:
    fetched_at = time.time()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO profile_cache (session_id, profile_json, fetched_at)
            VALUES (?, ?, ?)
            ON CONFLICT (session_id) DO UPDATE SET profile_json = excluded.profile_json, fetched_at = excluded.fetched_at
            """,
            (session_id, json.dumps(profile), fetched_at),
        )
    return {**profile, "fetched_at": fetched_at}


def get_setting(key: str, default: str) -> str:
    """Admin-editable global settings (poll interval, budget caps, etc.) — persisted here so an /admin change survives a restart, falling back to `default` (normally an env var) when unset."""
    with _connect() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row[0] if row is not None else default


def set_setting(key: str, value: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
