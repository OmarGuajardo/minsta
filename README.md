# minsta

A minimal Instagram client — Instagram without the fluff.

## Stack

- **Frontend**: Next.js + TypeScript + Tailwind CSS
- **Instagram API**: [instagrapi](https://github.com/subzeroid/instagrapi) (private/unofficial API), via a small custom FastAPI sidecar (`instagrapi-service/`)
- **Packaging**: Docker Compose

## Why the private API, and why this is risky

minsta previously used Meta's official "Instagram API with Instagram Login," but that API has no way to read posts from accounts you follow — it's scoped entirely to managing your own connected account, not consuming other people's content. Since minsta's whole point is a feed of people you follow (deliberately **no** explore/algorithmic content), that's a hard capability gap the official API can't close.

This version uses `instagrapi` instead, which talks to Instagram's actual private mobile-app API. That means:

- **This is against Instagram's Terms of Service.** Using it is a real risk to the account's standing, not just a technical inconvenience.
- Password-based login gets reliably blocked by Instagram's fraud detection (every login looks like a brand-new device). The workaround is logging in via a real Instagram **`sessionid` cookie** extracted from an already-authenticated browser session, which sidesteps the flagged login endpoint entirely.
- Session state (device fingerprint + auth cookies) is persisted server-side per session and reused on every request — never regenerated per-call, which is what made the original approach unreliable.

## Getting your sessionid

1. Log into [instagram.com](https://instagram.com) normally in a browser (handles 2FA fine — this is the lenient web login path, not the flagged private-API one).
2. Open dev tools → Application (Chrome/Edge) or Storage (Firefox) → Cookies → `instagram.com`.
3. Copy the value of the `sessionid` cookie. Treat it like a password.

## Getting Started

```bash
cp .env.example .env
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000), paste your `sessionid` on the login page.

## Development

```bash
npm install
cp .env.example .env
docker compose up instagrapi
npm run dev
```

The Python service also runs standalone without Docker, if preferred:

```bash
cd instagrapi-service
python3.12 -m venv .venv   # a Python version with prebuilt wheels for instagrapi's C-extension deps
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install --no-deps moviepy==2.2.1  # see requirements.txt for why this is a separate step
INSTAGRAPI_DATA_DIR=./data .venv/bin/uvicorn main:app --reload
```

## Feed design

`/feed` is deliberately built from `user_following()` + `user_medias()` per followed account, not instagrapi's `get_timeline_feed()` — the latter is Instagram's own ranked home feed, which mixes in suggested/explore-adjacent content. Each feed item shows exactly: the photo, the poster's username, their profile picture, and a few recent comments — nothing else.

## Known limitations (MVP)

- No UI for Instagram checkpoint/challenge verification.
- Comments are fetched per post sequentially (not in parallel) to stay gentle on rate limits, so `/feed` can be slow to load for accounts following many people.
- `sessionid` cookies aren't permanent — when Instagram invalidates it, you'll need to re-extract a fresh one from your browser and log in again.
