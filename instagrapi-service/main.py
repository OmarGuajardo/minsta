import logging
import os
import subprocess
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import imageio_ffmpeg
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
    # Single-account app: with exactly one persisted session, that's the
    # account /jobs shows poller history/preview for. With zero or multiple
    # sessions there's no unambiguous one to report on.
    sessions = storage.list_sessions()
    session_id = sessions[0] if len(sessions) == 1 else None
    accounts_per_tick = poller.get_accounts_per_tick()
    upcoming_usernames = db.get_upcoming_poll_preview(session_id, accounts_per_tick) if session_id else []

    return {
        "settings": {
            "poll_interval_seconds": poller.get_poll_interval_seconds(),
            "poll_accounts_per_tick": accounts_per_tick,
            "poll_people_limit": poller.get_people_limit(),
            "poll_posts_per_account": poller.get_posts_per_account(),
            "max_requests_per_hour": request_budget.get_max_requests_per_hour(),
            "max_requests_per_day": request_budget.get_max_requests_per_day(),
        },
        "poller": poller.get_status(),
        "last_run": db.get_last_poll_run(session_id) if session_id else None,
        "upcoming": {
            "usernames": upcoming_usernames,
            # +1 for the following-list fetch, unless close friends are set —
            # then that fetch is skipped entirely (see poller.poll_session_now).
            "estimated_requests": (
                (0 if db.has_close_friends(session_id) else 1) + len(upcoming_usernames) if session_id else 0
            ),
        },
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

    # Keyed by the Instagram account's own numeric id, not a random token —
    # otherwise every re-login orphans the account from its previously
    # polled posts/rotation state (they're stored per session_id in db.py).
    session_id = str(cl.user_id)
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


@app.get("/profile")
def profile(force_refresh: bool = False, client_and_id: tuple = Depends(get_client)):
    """Own profile (identity fields + follower/following/media counts), read
    from a local cache rather than hitting Instagram on every page view —
    this data changes far less often than the feed, so a plain cache-until-
    refreshed-manually is enough, no background rotation needed."""
    cl, session_id = client_and_id

    if not force_refresh:
        cached = db.get_cached_profile(session_id)
        if cached is not None:
            return cached

    request_budget.guard()
    account_info = cl.account_info()
    request_budget.guard()
    user = cl.user_info_by_username(account_info.username)
    persist(cl, session_id)

    data = {
        "username": account_info.username,
        "full_name": account_info.full_name,
        "biography": account_info.biography or "",
        "profile_pic_url": str(user.profile_pic_url_hd or user.profile_pic_url or account_info.profile_pic_url),
        "follower_count": user.follower_count,
        "following_count": user.following_count,
        "media_count": user.media_count,
    }
    return db.save_profile(session_id, data)


@app.get("/profile/posts")
def profile_posts(force_refresh: bool = False, client_and_id: tuple = Depends(get_client)):
    """Own posts (for the profile grid), cached in the same `posts` table
    /feed reads from, scoped to just this account's own user_id. A single
    account's own timeline, not a rotating list, so no poller/background
    involvement — cache-until-refreshed, same as /profile above."""
    cl, session_id = client_and_id

    if not force_refresh:
        cached = db.get_posts(session_id, user_id=session_id)
        if cached:
            return {"items": cached}

    request_budget.guard()
    medias = cl.user_medias(cl.user_id, 0)
    db.upsert_posts(session_id, [{"media": media, "user": media.user} for media in medias])
    persist(cl, session_id)
    return {"items": db.get_posts(session_id, user_id=session_id)}


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


MAX_ALBUM_ITEMS = 10
VIDEO_CONTENT_TYPE = "video/mp4"
QUICKTIME_CONTENT_TYPE = "video/quicktime"
VIDEO_CONTENT_TYPES = {VIDEO_CONTENT_TYPE, QUICKTIME_CONTENT_TYPE}


def _transcode_to_mp4(src: Path) -> Path:
    """iPhone recordings are typically .mov, often HEVC-encoded — Instagram's
    upload pipeline (and instagrapi's own video_rupload/album_upload
    extension dispatch) expects H.264/AAC MP4, so re-encode before handing
    off. Uses the ffmpeg binary imageio-ffmpeg already bundles for moviepy's
    thumbnail generation, rather than adding a separate dependency."""
    dst = src.with_name(src.stem + "-transcoded.mp4")
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    try:
        subprocess.run(
            [
                ffmpeg_exe,
                "-y",
                "-i",
                str(src),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",  # force widely-compatible 8-bit 4:2:0, regardless of the source's chroma/bit depth
                "-preset",
                "fast",
                "-crf",
                "23",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                str(dst),
            ],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as exc:
        logger.error("ffmpeg transcode of %s failed: %s", src.name, exc.stderr.decode(errors="replace")[-2000:])
        raise HTTPException(status_code=400, detail="Failed to convert video for upload.") from exc
    return dst


@app.post("/media/publish")
async def publish_media(
    caption: str = Form(""),
    files: list[UploadFile] = File(...),
    client_and_id: tuple = Depends(get_client),
):
    """A single photo publishes a normal photo post, a single video
    publishes a video post, and 2+ files (any mix of photos/videos) publish
    an Instagram carousel via album_upload — Instagram allows at most 10
    items either way. album_upload dispatches each item by file extension,
    so the temp files below must keep their real (post-transcode) suffix."""
    cl, session_id = client_and_id
    if not files:
        raise HTTPException(status_code=400, detail="At least one photo or video is required.")
    if len(files) > MAX_ALBUM_ITEMS:
        raise HTTPException(status_code=400, detail=f"Instagram allows at most {MAX_ALBUM_ITEMS} items per post.")

    tmp_paths: list[Path] = []
    try:
        for upload in files:
            is_video = upload.content_type in VIDEO_CONTENT_TYPES
            suffix = os.path.splitext(upload.filename or "")[1] or (".mp4" if is_video else ".jpg")
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(await upload.read())
                tmp_path = Path(tmp.name)

            if upload.content_type == QUICKTIME_CONTENT_TYPE:
                transcoded = _transcode_to_mp4(tmp_path)
                tmp_path.unlink(missing_ok=True)
                tmp_path = transcoded
            tmp_paths.append(tmp_path)

        request_budget.guard()
        if len(tmp_paths) > 1:
            media = cl.album_upload(tmp_paths, caption)
        elif files[0].content_type in VIDEO_CONTENT_TYPES:
            media = cl.video_upload(tmp_paths[0], caption)
        else:
            media = cl.photo_upload(tmp_paths[0], caption)
    finally:
        for tmp_path in tmp_paths:
            tmp_path.unlink(missing_ok=True)

    persist(cl, session_id)
    return media
