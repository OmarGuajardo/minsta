import asyncio
import logging
import os
import time
from typing import Any, Optional

from instagrapi import Client
from instagrapi.exceptions import ChallengeRequired, LoginRequired
from instagrapi.types import UserShort

import db
import request_budget
import storage

logger = logging.getLogger("instagrapi-service.poller")

# Ticks every 30 min so freshness is checked often, but each tick only polls
# a rotating subset of followed accounts (not everyone) — a full rescan on
# every tick would badly exceed the ~400 requests/day danger zone found in
# community reports on instagrapi's ban risk. This spreads volume out
# smoothly across the day instead of bursting it, which is also closer to
# instagrapi's own guidance to look "human-like" rather than automated.
#
# These are settings-backed (admin-editable via /admin, persisted in SQLite)
# rather than frozen constants, so a change takes effect on the very next
# tick/call instead of requiring a restart. Falls back to the env var, then
# to the hardcoded default, if never set via /admin.


def get_poll_interval_seconds() -> int:
    return int(db.get_setting("poll_interval_seconds", os.getenv("INSTAGRAM_POLL_INTERVAL_SECONDS", "1800")))


def get_accounts_per_tick() -> int:
    return int(db.get_setting("poll_accounts_per_tick", os.getenv("INSTAGRAM_POLL_ACCOUNTS_PER_TICK", "6")))


def get_people_limit() -> int:
    return int(db.get_setting("poll_people_limit", os.getenv("INSTAGRAM_POLL_PEOPLE_LIMIT", "30")))


def get_posts_per_account() -> int:
    return int(db.get_setting("poll_posts_per_account", os.getenv("INSTAGRAM_POLL_POSTS_PER_ACCOUNT", "2")))


_task: Optional[asyncio.Task] = None
_wake_event = asyncio.Event()


def is_paused() -> bool:
    return db.get_setting("poller_paused", "0") == "1"


def set_paused(paused: bool) -> None:
    db.set_setting("poller_paused", "1" if paused else "0")
    if not paused:
        _wake_event.set()


def trigger_now() -> None:
    """Wakes the loop immediately instead of waiting out the remaining interval."""
    _wake_event.set()


def get_status() -> dict[str, Any]:
    return {"paused": is_paused(), "tracked_sessions": len(storage.list_sessions())}


def _build_client(session_id: str) -> Optional[Client]:
    settings = storage.load_settings(session_id)
    if settings is None:
        return None
    cl = Client(delay_range=[1, 3])
    cl.set_settings(settings)
    return cl


def _budget_exhausted() -> bool:
    budget = request_budget.remaining()
    return budget["this_hour"] <= 0 or budget["today"] <= 0


def poll_session_now(session_id: str) -> None:
    cl = _build_client(session_id)
    if cl is None:
        return

    started_at = time.time()

    if _budget_exhausted():
        logger.info("Skipping poll for session %s — request budget exhausted", session_id)
        db.record_poll_run(session_id, started_at, time.time(), [], 0, 0, "skipped_budget", "Request budget exhausted")
        return

    requests_used = 0
    if db.has_close_friends(session_id):
        # Already know exactly who to check — skip the following-list fetch
        # entirely (it exists only to discover accounts and sync the
        # rotation cache, neither of which matters once we're scoped to an
        # already-known, already-tracked close-friends list) and read
        # candidates straight from that local cache instead, saving one
        # real Instagram request every tick.
        candidates = db.get_close_friend_accounts_to_poll(session_id, get_accounts_per_tick())
        accounts = [
            (
                c["user_id"],
                UserShort(pk=c["user_id"], username=c["username"], profile_pic_url=c["profile_pic_url"] or None),
            )
            for c in candidates
        ]
    else:
        try:
            request_budget.guard("poller.user_following")
            requests_used += 1
            following = cl.user_following(cl.user_id, amount=get_people_limit())
        except (ChallengeRequired, LoginRequired):
            logger.warning(
                "Poll: session %s needs Instagram's account-verification checkpoint completed "
                "(in the official app/website) before polling can continue",
                session_id,
            )
            db.record_poll_run(
                session_id, started_at, time.time(), [], 0, requests_used, "needs_checkpoint",
                "Instagram requires a verification checkpoint completed in the official app/website",
            )
            return
        except Exception as exc:
            logger.warning("Poll: failed to fetch following list for session %s", session_id, exc_info=True)
            db.record_poll_run(
                session_id, started_at, time.time(), [], 0, requests_used, "failed",
                f"Failed to fetch following list: {exc}",
            )
            return

        accounts = db.get_accounts_to_poll(session_id, following, get_accounts_per_tick())

    checked_usernames: list[str] = []
    posts_fetched = 0
    status = "completed"
    detail = ""
    last_error = ""
    for followed_user_id, user_short in accounts:
        if _budget_exhausted():
            status = "partial_budget"
            detail = "Request budget exhausted mid-tick"
            logger.info("Poll: request budget exhausted mid-tick for session %s", session_id)
            break
        try:
            request_budget.guard("poller.user_medias", user_short.username or str(followed_user_id))
            requests_used += 1
            medias = cl.user_medias(followed_user_id, get_posts_per_account())
            db.upsert_posts(session_id, [{"media": m, "user": user_short} for m in medias])
            posts_fetched += len(medias)
            checked_usernames.append(user_short.username or str(followed_user_id))
        except Exception as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            logger.warning("Poll: failed to fetch posts for %s", user_short.username, exc_info=True)
        finally:
            # Mark checked even on failure, so a broken account doesn't get
            # retried every tick and starve the rest of the rotation.
            db.mark_checked(session_id, followed_user_id)

    # Don't report "completed" when every single account fetch actually
    # failed — that's a real failure (e.g. Instagram rejecting this session's
    # ability to read others' feeds specifically), not a no-op success.
    if status == "completed" and accounts and not checked_usernames:
        status = "no_successful_fetches"
        detail = f"All {len(accounts)} account fetch(es) failed. Last error: {last_error}"

    storage.save_settings(session_id, cl.get_settings())
    db.record_poll_run(session_id, started_at, time.time(), checked_usernames, posts_fetched, requests_used, status, detail)


async def _poll_loop() -> None:
    while True:
        if is_paused():
            await asyncio.sleep(5)
            continue

        for session_id in storage.list_sessions():
            try:
                await asyncio.to_thread(poll_session_now, session_id)
            except Exception:
                logger.exception("Poll tick failed for session %s", session_id)

        _wake_event.clear()
        try:
            # trigger_now() (or resuming from a pause) sets _wake_event, which
            # interrupts this wait immediately instead of sleeping out the
            # rest of the interval.
            await asyncio.wait_for(_wake_event.wait(), timeout=get_poll_interval_seconds())
        except asyncio.TimeoutError:
            pass


def start() -> None:
    global _task
    if _task is None:
        _task = asyncio.create_task(_poll_loop())
        logger.info(
            "Started background poller: every %ss, %s accounts/tick, up to %s people, %s posts/account",
            get_poll_interval_seconds(),
            get_accounts_per_tick(),
            get_people_limit(),
            get_posts_per_account(),
        )


def stop() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        _task = None
