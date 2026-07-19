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

import db
import poller
import request_budget
import storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("instagrapi-service")


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
    return JSONResponse(status_code=500, content={"detail": str(exc), "exc_type": type(exc).__name__})


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
def login(sessionid: str = Form(...)):
    logger.info("login_by_sessionid attempt, sessionid length=%d, prefix=%r", len(sessionid), sessionid[:15])
    request_budget.guard()
    cl = build_client()
    try:
        cl.login_by_sessionid(sessionid)
    except Exception as exc:
        logger.exception("login_by_sessionid failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=401, detail=f"Instagram login failed: {type(exc).__name__}: {exc}")

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
