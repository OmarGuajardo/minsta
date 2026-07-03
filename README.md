# minsta

A minimal Instagram client — Instagram without the fluff.

## Stack

- **Frontend**: Next.js + TypeScript + Tailwind CSS
- **Instagram API**: [aiograpi-rest](https://github.com/subzeroid/aiograpi-rest) (Docker sidecar)
- **Packaging**: Docker Compose

## Getting Started

1. Run `docker compose up --build`
2. Open [http://localhost:3000](http://localhost:3000) and log in with your Instagram username/password

Your Instagram credentials are entered at login, not stored in `.env` — the app only holds a server-side session cookie after login.

## Development

```bash
npm install
cp .env.example .env
docker compose up instagrapi
npm run dev
```

## Known limitations (MVP)

- No UI for Instagram checkpoint/challenge verification — if Instagram flags the login, you'll see an error asking you to log in via the official app first, then retry here.
- 2FA (time-based one-time code) is supported: a code field appears after a first attempt that requires it.
