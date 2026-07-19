import os
import time
from collections import deque
from threading import Lock

from fastapi import HTTPException

import db

# Self-imposed caps on real Instagram private-API calls, independent of
# instagrapi's own delay_range pacing between individual calls. Community
# reports on instagrapi's ban risk point at sustained volume around ~400
# requests/day as a danger zone — an hourly cap alone doesn't prevent that if
# usage is spread evenly across many hours, so both windows are tracked.
#
# Settings-backed (admin-editable via /admin, persisted in SQLite) rather
# than frozen constants, so a change takes effect on the very next call
# instead of requiring a restart. Falls back to the env var, then the
# hardcoded default, if never set via /admin.
HOUR_WINDOW_SECONDS = 60 * 60
DAY_WINDOW_SECONDS = 24 * 60 * 60


def get_max_requests_per_hour() -> int:
    return int(db.get_setting("max_requests_per_hour", os.getenv("INSTAGRAM_MAX_REQUESTS_PER_HOUR", "80")))


def get_max_requests_per_day() -> int:
    return int(db.get_setting("max_requests_per_day", os.getenv("INSTAGRAM_MAX_REQUESTS_PER_DAY", "350")))


_lock = Lock()
_timestamps: deque[float] = deque()


def _prune(now: float) -> None:
    while _timestamps and now - _timestamps[0] > DAY_WINDOW_SECONDS:
        _timestamps.popleft()


def _count_since(now: float, window_seconds: float) -> int:
    cutoff = now - window_seconds
    return sum(1 for t in _timestamps if t >= cutoff)


def remaining() -> dict[str, int]:
    with _lock:
        now = time.time()
        _prune(now)
        return {
            "this_hour": max(0, get_max_requests_per_hour() - _count_since(now, HOUR_WINDOW_SECONDS)),
            "today": max(0, get_max_requests_per_day() - _count_since(now, DAY_WINDOW_SECONDS)),
        }


def usage() -> dict[str, dict[str, int]]:
    """Used + limit for both windows — for surfacing to the UI so usage is visible while browsing, not just enforced silently."""
    with _lock:
        now = time.time()
        _prune(now)
        return {
            "hour": {"used": _count_since(now, HOUR_WINDOW_SECONDS), "limit": get_max_requests_per_hour()},
            "day": {"used": _count_since(now, DAY_WINDOW_SECONDS), "limit": get_max_requests_per_day()},
        }


def guard() -> None:
    """Call immediately before each real Instagram private-API request. Raises
    a 429 instead of making the call if either budget window is used up."""
    with _lock:
        now = time.time()
        _prune(now)
        max_per_hour = get_max_requests_per_hour()
        max_per_day = get_max_requests_per_day()
        hour_count = _count_since(now, HOUR_WINDOW_SECONDS)
        day_count = _count_since(now, DAY_WINDOW_SECONDS)
        if hour_count >= max_per_hour:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Reached minsta's self-imposed limit of {max_per_hour} Instagram requests "
                    "per hour, to avoid triggering Instagram's own rate limiting or account flags. "
                    "Please wait before trying again."
                ),
            )
        if day_count >= max_per_day:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Reached minsta's self-imposed limit of {max_per_day} Instagram requests "
                    "for today, to avoid triggering Instagram's own rate limiting or account flags. "
                    "Please wait until tomorrow."
                ),
            )
        _timestamps.append(now)
