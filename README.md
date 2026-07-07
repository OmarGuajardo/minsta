# minsta

A minimal Instagram client — Instagram without the fluff.

## Stack

- **Frontend**: Next.js + TypeScript + Tailwind CSS
- **Instagram API**: [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login) (official Meta OAuth API)
- **Packaging**: Docker Compose

## Setup

Instagram's official API requires some one-time setup in Meta's developer dashboard:

1. Create a Meta app at [developers.facebook.com/apps](https://developers.facebook.com/apps) (type: Business), and add the **Instagram** product → "API setup with Instagram Login".
2. Convert the target Instagram account to **Professional** (Business or Creator): Instagram app → Settings → Account type.
3. Add that account as an **Instagram tester** under the app's Instagram product page, and accept the tester invite from inside the Instagram app (Settings → Apps and websites → Tester invites). This is what unlocks Standard Access with no App Review needed.
4. Copy the **Instagram App ID** and **Instagram App Secret** from the Instagram product's setup page.
5. Register a redirect URI in "Valid OAuth Redirect URIs": `<your-https-url>/api/auth/instagram/callback`. This must be HTTPS and publicly reachable — for local dev, run `ngrok http 3000` and use the generated `https://*.ngrok-free.app` (or `.dev`) URL. Note: free ngrok URLs change on restart, so you'll need to update this each time unless you have a static domain.

## Getting Started

```bash
cp .env.example .env
# fill in INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI

docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) (or your ngrok URL) and click "Connect Instagram" to authorize via Instagram's own login page.

Your Instagram credentials are never seen by this app — Instagram handles login and 2FA on its own domain, and hands minsta back an access token, which is stored server-side in a session cookie.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

## Known limitations (MVP)

- No token-refresh automation — long-lived access tokens last 60 days and are refreshable after 24 hours, but minsta doesn't yet refresh them proactively. Reconnecting via "Connect Instagram" gets a fresh token.
- Standard Access only supports the connected account itself — no arbitrary username lookups (minsta only ever shows the logged-in user's own profile and posts, so this isn't a functional gap today).
