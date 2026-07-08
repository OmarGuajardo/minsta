import os
import time
from collections import deque
from threading import Lock

from fastapi import HTTPException

# A self-imposed cap on real Instagram private-API calls per rolling hour,
# independent of instagrapi's own delay_range pacing between calls. Pacing
# alone doesn't prevent a single /feed request (which can fire 30+ calls,
# one per followed account) from adding up with other activity into a
# volume that looks automated over the course of an hour — this tracks and
# caps total volume regardless of how it's spread across requests.
WINDOW_SECONDS = 60 * 60
MAX_REQUESTS_PER_WINDOW = int(os.getenv("INSTAGRAM_MAX_REQUESTS_PER_HOUR", "200"))

_lock = Lock()
_timestamps: deque[float] = deque()


def _prune(now: float) -> None:
    while _timestamps and now - _timestamps[0] > WINDOW_SECONDS:
        _timestamps.popleft()


def remaining() -> int:
    with _lock:
        _prune(time.time())
        return max(0, MAX_REQUESTS_PER_WINDOW - len(_timestamps))


def guard() -> None:
    """Call immediately before each real Instagram private-API request. Raises
    a 429 instead of making the call if this hour's budget is used up."""
    with _lock:
        _prune(time.time())
        if len(_timestamps) >= MAX_REQUESTS_PER_WINDOW:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Reached minsta's self-imposed limit of {MAX_REQUESTS_PER_WINDOW} Instagram requests "
                    "per hour, to avoid triggering Instagram's own rate limiting or account flags. "
                    "Please wait before trying again."
                ),
            )
        _timestamps.append(time.time())
