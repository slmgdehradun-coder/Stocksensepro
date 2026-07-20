<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/58dbfd20-7e8b-4c44-bcda-3c56f5f85d16

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `pnpm install`
2. Set the server-only `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `pnpm run dev`

StockSense Pro is for educational and analytical purposes only and is not financial advice.

## Deploy on Vercel

1. Import this folder/repository in Vercel or deploy with Vercel CLI.
2. Add these Environment Variables in Vercel Project Settings:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` = `gemini-3-flash-preview` (optional)
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` for Google Sign-In
   - `GOOGLE_CLIENT_ID` = same Google OAuth client ID (optional server alias)
   - `AUTH_SECRET`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `ADMIN_NAME` (optional)
   - `ADMIN_MOBILE` (optional)
   - `KV_REST_API_URL` and `KV_REST_API_TOKEN` from Vercel KV/Upstash Redis for durable production users/subscriptions
   - `STOCKSENSE_DB_KEY` = `stocksense:db:v1` (optional)
3. Use the default Next.js build command: `pnpm run build`.
4. Deploy to production.

## Deploy with Docker

```bash
cp .env.docker.example .env   # fill in AUTH_SECRET and ADMIN_PASSWORD
docker compose up -d --build
```

See [DOCKER.md](./DOCKER.md) for the full guide, including an optional self-hosted
Redis-backed durable storage overlay (`docker-compose.durable.yml`).

## Free/Pro subscription flow

- Signup creates a Free user only. Pro cannot be self-selected.
- Admin users sign in at `/admin` and can approve payments, block users, assign Pro start/end dates, and add calendar active days.
- Users request Pro from `/upgrade` after paying manually by UPI/QR and submitting plan, amount, UTR, date, and optional screenshot.
- Protected Pro modules include AI Screener, Options Chain, Portfolio/Paper Trading, and Gemini prediction APIs.
- Default local admin seed is `admin@stocksense.local` / `Admin@12345` unless `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set before first run.
- Google Sign-In requires a Google OAuth Web Client ID. Add authorized JavaScript origins for `http://localhost:3000` and your Vercel domain, then paste the client ID into Vercel environment variables.

## Storage note

The included JSON store is for local/demo use and uses `data/stocksense-db.json` locally. On Vercel, add `KV_REST_API_URL` and `KV_REST_API_TOKEN` from Vercel KV/Upstash Redis so signup users, admin approvals, payments, paper trades, and sessions remain consistent across serverless restarts. Without durable storage, Vercel can reset local file data after a cold start.
