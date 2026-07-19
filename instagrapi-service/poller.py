import asyncio
import logging
import os
from typing import Optional

from instagrapi import Client
from instagrapi.exceptions import ChallengeRequired, LoginRequired

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
POLL_INTERVAL_SECONDS = int(os.getenv("INSTAGRAM_POLL_INTERVAL_SECONDS", "1800"))
ACCOUNTS_PER_TICK = int(os.getenv("INSTAGRAM_POLL_ACCOUNTS_PER_TICK", "6"))
PEOPLE_LIMIT = int(os.getenv("INSTAGRAM_POLL_PEOPLE_LIMIT", "30"))
POSTS_PER_ACCOUNT = int(os.getenv("INSTAGRAM_POLL_POSTS_PER_ACCOUNT", "2"))

_task: Optional[asyncio.Task] = None


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

    if _budget_exhausted():
        logger.info("Skipping poll for session %s — request budget exhausted", session_id)
        return

    try:
        request_budget.guard()
        following = cl.user_following(cl.user_id, amount=PEOPLE_LIMIT)
    except (ChallengeRequired, LoginRequired):
        logger.warning(
            "Poll: session %s needs Instagram's account-verification checkpoint completed "
            "(in the official app/website) before polling can continue",
            session_id,
        )
        return
    except Exception:
        logger.warning("Poll: failed to fetch following list for session %s", session_id, exc_info=True)
        return

    accounts = db.get_accounts_to_poll(session_id, following, ACCOUNTS_PER_TICK)
    for followed_user_id, user_short in accounts:
        if _budget_exhausted():
            logger.info("Poll: request budget exhausted mid-tick for session %s", session_id)
            break
        try:
            request_budget.guard()
            medias = cl.user_medias(followed_user_id, POSTS_PER_ACCOUNT)
            db.upsert_posts(session_id, [{"media": m, "user": user_short} for m in medias])
        except Exception:
            logger.warning("Poll: failed to fetch posts for %s", user_short.username, exc_info=True)
        finally:
            # Mark checked even on failure, so a broken account doesn't get
            # retried every tick and starve the rest of the rotation.
            db.mark_checked(session_id, followed_user_id)

    storage.save_settings(session_id, cl.get_settings())


async def _poll_loop() -> None:
    while True:
        for session_id in storage.list_sessions():
            try:
                await asyncio.to_thread(poll_session_now, session_id)
            except Exception:
                logger.exception("Poll tick failed for session %s", session_id)
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


def start() -> None:
    global _task
    if _task is None:
        _task = asyncio.create_task(_poll_loop())
        logger.info(
            "Started background poller: every %ss, %s accounts/tick, up to %s people, %s posts/account",
            POLL_INTERVAL_SECONDS,
            ACCOUNTS_PER_TICK,
            PEOPLE_LIMIT,
            POSTS_PER_ACCOUNT,
        )


def stop() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        _task = None
