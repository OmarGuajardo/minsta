import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from instagrapi import Client

import storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("instagrapi-service")

app = FastAPI(title="minsta instagrapi service")

# /feed re-fetches the following list on every call (cheap, one call) so
# unfollows/follows are never stale — only each account's own posts are
# cached, since that's the expensive part (one call per followed account,
# each paced by delay_range).
USER_MEDIA_CACHE_TTL_SECONDS = 300
_user_media_cache: dict[tuple[str, str, int], tuple[float, list]] = {}


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


@app.post("/auth/login")
def login(sessionid: str = Form(...)):
    logger.info("login_by_sessionid attempt, sessionid length=%d, prefix=%r", len(sessionid), sessionid[:15])
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
    info = cl.account_info()
    persist(cl, session_id)
    return info


@app.get("/user/{username}")
def user_by_username(username: str, client_and_id: tuple = Depends(get_client)):
    cl, session_id = client_and_id
    user = cl.user_info_by_username(username)
    persist(cl, session_id)
    return user


@app.get("/user/{username}/posts")
def user_posts(username: str, amount: int = 24, client_and_id: tuple = Depends(get_client)):
    cl, session_id = client_and_id
    user_id = cl.user_id_from_username(username)
    medias = cl.user_medias(user_id, amount)
    persist(cl, session_id)
    return {"items": medias}


@app.get("/feed")
def feed(
    people_limit: int = 30,
    per_user: int = 2,
    force_refresh: bool = False,
    client_and_id: tuple = Depends(get_client),
):
    """Aggregated feed built only from accounts the logged-in user follows.

    Deliberately NOT instagrapi's get_timeline_feed() — that's Instagram's own
    ranked home feed, which mixes in suggested/explore-adjacent content. This
    builds the feed ourselves from user_following() + user_medias() per
    account so it's strictly limited to people actually followed.
    """
    cl, session_id = client_and_id

    # Always fetched fresh — this is one cheap call, and caching it was what
    # made unfollows/follows invisible until the whole feed cache expired.
    following = cl.user_following(cl.user_id, amount=people_limit)

    items = []
    for followed_user_id, user_short in following.items():
        media_cache_key = (session_id, followed_user_id, per_user)
        cached = _user_media_cache.get(media_cache_key)
        if not force_refresh and cached and (time.time() - cached[0]) < USER_MEDIA_CACHE_TTL_SECONDS:
            medias = cached[1]
        else:
            try:
                medias = cl.user_medias(followed_user_id, per_user)
            except Exception:
                logger.warning("Skipping %s in feed — media fetch failed", user_short.username, exc_info=True)
                continue
            _user_media_cache[media_cache_key] = (time.time(), medias)

        for media in medias:
            items.append({"media": media, "user": user_short})

    persist(cl, session_id)
    items.sort(key=lambda item: item["media"].taken_at, reverse=True)
    return {"items": items}


@app.get("/media/{media_id}/comments")
def media_comments(media_id: str, amount: int = 10, client_and_id: tuple = Depends(get_client)):
    cl, session_id = client_and_id
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
        media = cl.photo_upload(tmp_path, caption)
    finally:
        tmp_path.unlink(missing_ok=True)

    persist(cl, session_id)
    return media
