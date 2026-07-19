import logging
import os
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from instagrapi import Client
from instagrapi.exceptions import (
    ChallengeRequired,
    ClientLoginRequired,
    LoginRequired,
    PleaseWaitFewMinutes,
    RateLimitError,
)
from pydantic import BaseModel, Field

import db
import poller
import request_budget
import storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("instagrapi-service")

# instagrapi raises these when a previously-valid session stops working
# mid-use (Instagram revoked/expired it) — as opposed to get_client's 401,
# which fires when there's no local session at all. Both need to reach the
# frontend as the same "not_authenticated" signal so it can prompt a re-login.
SESSION_INVALID_EXCEPTIONS = (LoginRequired, ClientLoginRequired)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    poller.start()
    yield
    poller.stop()


app = FastAPI(title="minsta instagrapi service", lifespan=lifespan)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    status_code = 500
    if isinstance(exc, SESSION_INVALID_EXCEPTIONS):
        status_code = 401
    elif isinstance(exc, ChallengeRequired):
        status_code = 403
    elif isinstance(exc, (RateLimitError, PleaseWaitFewMinutes)):
        status_code = 429
    return JSONResponse(status_code=status_code, content={"detail": str(exc), "exc_type": type(exc).__name__})


def build_client(settings: Optional[dict] = None) -> Client:
    # delay_range paces successive private-API calls a couple seconds apart,
    # which matters more for the account-scanning /feed endpoint than any
    # single call — Instagram rate-limits/flags bursts of rapid requests.
    cl = Client(delay_range=[1, 3])
    if settings:
        cl.set_settings(settings)
    return cl


def get_client(x_session_id: str = Header(..., alias="X-Session-ID")) -> tuple[Client, str]:
    settings = storage.load_settings(x_session_id)
    if settings is None:
        raise HTTPException(status_code=401, detail="Session not found — please log in again.")
    return build_client(settings), x_session_id


def persist(cl: Client, session_id: str) -> None:
    storage.save_settings(session_id, cl.get_settings())


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/status")
def status():
    return {"request_budget": request_budget.usage()}


@app.get("/rotation-status")
def rotation_status(client_and_id: tuple = Depends(get_client)):
    """Every followed account the background poller knows about for this session, and when it was last actually checked — for surfacing rotation coverage in the UI."""
    _cl, session_id = client_and_id
    return {"items": db.get_rotation_status(session_id)}


class AdminSettingsUpdate(BaseModel):
    poll_interval_seconds: Optional[int] = Field(default=None, ge=60)
    poll_accounts_per_tick: Optional[int] = Field(default=None, ge=1)
    poll_people_limit: Optional[int] = Field(default=None, ge=1)
    poll_posts_per_account: Optional[int] = Field(default=None, ge=1)
    max_requests_per_hour: Optional[int] = Field(default=None, ge=1)
    max_requests_per_day: Optional[int] = Field(default=None, ge=1)


def _admin_status() -> dict:
    return {
        "settings": {
            "poll_interval_seconds": poller.get_poll_interval_seconds(),
            "poll_accounts_per_tick": poller.get_accounts_per_tick(),
            "poll_people_limit": poller.get_people_limit(),
            "poll_posts_per_account": poller.get_posts_per_account(),
            "max_requests_per_hour": request_budget.get_max_requests_per_hour(),
            "max_requests_per_day": request_budget.get_max_requests_per_day(),
        },
        "poller": poller.get_status(),
    }


@app.get("/admin/status")
def admin_status():
    """Current effective values for every admin-editable setting, plus the background poller's running/paused state — no session auth needed, this is global process state rather than per-account data (same reasoning as the existing /status endpoint)."""
    return _admin_status()


@app.post("/admin/settings")
def admin_update_settings(update: AdminSettingsUpdate):
    for key, value in update.model_dump(exclude_none=True).items():
        db.set_setting(key, str(value))
    return _admin_status()


@app.post("/admin/poller/pause")
def admin_pause_poller():
    poller.set_paused(True)
    return poller.get_status()


@app.post("/admin/poller/resume")
def admin_resume_poller():
    poller.set_paused(False)
    return poller.get_status()


@app.post("/admin/poller/trigger-now")
def admin_trigger_poller():
    poller.trigger_now()
    return {"ok": True}


@app.post("/rotation/{followed_user_id}/close-friend")
def set_close_friend(
    followed_user_id: str,
    is_close_friend: bool = Form(...),
    client_and_id: tuple = Depends(get_client),
):
    """Marks/unmarks an account as a close friend. Once any account is marked,
    the poller (see db.get_accounts_to_poll) polls ONLY close friends instead
    of the whole following list, until none remain marked."""
    _cl, session_id = client_and_id
    db.set_close_friend(session_id, followed_user_id, is_close_friend)
    return {"ok": True}


@app.post("/auth/login")
def login(
    sessionid: Optional[str] = Form(None),
    username: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    verification_code: Optional[str] = Form(None),
):
    if not sessionid and not (username and password):
        raise HTTPException(status_code=400, detail="Provide a sessionid, or a username and password.")

    request_budget.guard()
    cl = build_client()
    try:
        if sessionid:
            logger.info("login_by_sessionid attempt, sessionid length=%d, prefix=%r", len(sessionid), sessionid[:15])
            cl.login_by_sessionid(sessionid)
        else:
            logger.info("login attempt for username=%r (2fa code provided: %s)", username, bool(verification_code))
            cl.login(username, password, verification_code=verification_code or "")
    except Exception as exc:
        # Returned as a JSONResponse (not HTTPException) so exc_type travels
        # with the error body — the frontend uses it to tell "needs a 2FA
        # code" apart from "wrong password" apart from "session cookie stale".
        logger.exception("login failed: %s: %s", type(exc).__name__, exc)
        return JSONResponse(
            status_code=401,
            content={
                "detail": f"Instagram login failed: {type(exc).__name__}: {exc}",
                "exc_type": type(exc).__name__,
            },
        )

    session_id = storage.new_session_id()
    persist(cl, session_id)
    return {"session_id": session_id}


@app.post("/auth/logout")
def logout(x_session_id: str = Header(..., alias="X-Session-ID")):
    storage.delete_session(x_session_id)
    return {"ok": True}


@app.get("/account")
def account(client_and_id: tuple = Depends(get_client)):
    cl, session_id = client_and_id
    request_budget.guard()
    info = cl.account_info()
    persist(cl, session_id)
    return info


@app.get("/user/{username}")
def user_by_username(username: str, client_and_id: tuple = Depends(get_client)):
    cl, session_id = client_and_id
    request_budget.guard()
    user = cl.user_info_by_username(username)
    persist(cl, session_id)
    return user


@app.get("/user/{username}/posts")
def user_posts(username: str, amount: int = 24, client_and_id: tuple = Depends(get_client)):
    cl, session_id = client_and_id
    request_budget.guard()
    user_id = cl.user_id_from_username(username)
    request_budget.guard()
    medias = cl.user_medias(user_id, amount)
    persist(cl, session_id)
    return {"items": medias}


@app.get("/feed")
def feed(
    days: Optional[int] = None,
    force_refresh: bool = False,
    client_and_id: tuple = Depends(get_client),
):
    """Feed of posts from followed accounts, read from the local database
    kept up to date by the background poller (poller.py) rather than
    scanning Instagram live on every page view.

    Deliberately NOT built from Instagram's own get_timeline_feed() — that's
    Instagram's own ranked home feed, which mixes in suggested/explore-
    adjacent content. The poller itself uses user_following() + user_medias()
    per account, so this is strictly limited to people actually followed.
    """
    _cl, session_id = client_and_id

    if force_refresh:
        # On-demand poll for just this session instead of waiting for the
        # next scheduled tick — still respects the same request budget.
        poller.poll_session_now(session_id)

    since = time.time() - days * 24 * 60 * 60 if days else None
    items = db.get_posts(session_id, since=since)
    return {"items": items}


@app.get("/media/{media_id}/comments")
def media_comments(media_id: str, amount: int = 10, client_and_id: tuple = Depends(get_client)):
    cl, session_id = client_and_id
    request_budget.guard()
    comments = cl.media_comments(media_id, amount)
    persist(cl, session_id)
    return {"items": comments}


@app.post("/media/publish_photo")
async def publish_photo(
    caption: str = Form(""),
    file: UploadFile = File(...),
    client_and_id: tuple = Depends(get_client),
):
    cl, session_id = client_and_id
    suffix = os.path.splitext(file.filename or "upload.jpg")[1] or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = Path(tmp.name)

    try:
        request_budget.guard()
        media = cl.photo_upload(tmp_path, caption)
    finally:
        tmp_path.unlink(missing_ok=True)

    persist(cl, session_id)
    return media
