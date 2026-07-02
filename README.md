# minsta

A minimal Instagram client — Instagram without the fluff.

## Stack

- **Frontend**: Next.js + TypeScript + Tailwind CSS
- **Instagram API**: [aiograpi-rest](https://github.com/subzeroid/aiograpi-rest) (Docker sidecar)
- **Packaging**: Docker Compose

## Getting Started

1. Copy `.env.example` to `.env` and fill in your credentials
2. Run `docker compose up`
3. Open [http://localhost:3000](http://localhost:3000)

## Development

```bash
npm install
npm run dev
```

Requires the aiograpi-rest service running locally:
```bash
docker compose up instagrapi
```
