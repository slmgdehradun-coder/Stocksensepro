# Running StockSense Pro with Docker

This covers building and running the app as a container, with either simple local-file
storage or durable Redis-backed storage.

## 1. Quick start (docker compose)

```bash
cp .env.docker.example .env
# edit .env: set AUTH_SECRET and ADMIN_PASSWORD at minimum (see comments in the file)

docker compose up -d --build
```

The app is now at http://localhost:3000. Data (users, subscriptions, paper trades,
payments) is stored in `data/stocksense-db.json` inside the `stocksense-data` named
volume, so it survives `docker compose restart` / `docker compose stop` / `docker compose
up` again, but **not** `docker compose down -v` or deleting the volume.

Generate `AUTH_SECRET` with:

```bash
openssl rand -base64 48
```

## 2. Durable storage (Redis-backed, survives volume loss / multiple replicas)

The default setup above is fine for local use, demos, and single-instance deployments.
For anything that needs data to survive a fresh container (no reliance on the named
volume) or that might run more than one replica, layer the durable overlay on top:

```bash
docker compose -f docker-compose.yml -f docker-compose.durable.yml up -d --build
```

This starts two extra containers:

- `redis` - a standard `redis:7-alpine` with AOF persistence enabled.
- `srh` - [`serverless-redis-http`](https://github.com/hiett/serverless-redis-http), a
  small open-source proxy that exposes a real Redis over the same REST API that Vercel
  KV / Upstash Redis use.

`lib/server/db.ts` already speaks that REST protocol (it's how the app talks to Vercel
KV / Upstash Redis in production on Vercel), so nothing in the app needed to change -
the durable overlay just points `KV_REST_API_URL` at the local `srh` proxy instead of a
cloud REST endpoint. Set `SRH_TOKEN` in `.env` to a random string if this stack is
reachable outside your own machine (the built-in default is fine for purely local use).

## 3. Building and running without compose

```bash
docker build -t stocksense-pro .

docker run -d \
  --name stocksense-pro \
  -p 3000:3000 \
  --env-file .env \
  -v stocksense-data:/app/data \
  stocksense-pro
```

If you use Google Sign-In, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` must be passed as a **build**
argument (it gets inlined into the client JS bundle), not just a runtime env var:

```bash
docker build -t stocksense-pro \
  --build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-client-id" \
  .
```

`docker-compose.yml` already does this for you via `build.args`, reading
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` from `.env`.

## 4. Environment variables

See `.env.docker.example` for the full list with comments. Summary:

| Variable | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | Yes | Signs session cookies. Long random string. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Yes | Seeded admin account on first boot. |
| `GEMINI_API_KEY` | No | AI narrative falls back to a deterministic summary without it. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` | No | Needed only for Google Sign-In. Build arg + runtime var. |
| `UPI_ID` / `UPI_QR_IMAGE_URL` | No | Shown on the `/upgrade` page. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | No | Set automatically by `docker-compose.durable.yml`; set manually to point at Vercel KV / Upstash instead. |
| `SRH_TOKEN` | No | Shared secret for the local Redis-REST proxy (durable overlay only). |

## 5. Health check

`GET /api/health` returns `{ "status": "ok" }` and is used by the Dockerfile's
`HEALTHCHECK` and the compose healthcheck. It only checks that the Next.js server is
responding - it does not depend on Yahoo Finance, Gemini, or the database, so it stays
accurate even if one of those is briefly unavailable.

```bash
docker inspect --format='{{json .State.Health}}' stocksense-pro
```

## 6. Logs and updates

```bash
docker compose logs -f app
docker compose pull        # if you publish the image to a registry
docker compose up -d --build   # rebuild after pulling new source
```

## 7. Known limitations carried over from the app itself

- Yahoo Finance and Gemini calls happen from inside the container at request time, so
  the container needs outbound internet access.
- The in-memory rate limiter (`lib/server/rateLimit.ts`) is per-process. It works
  correctly for a single container but does not share state across replicas - put a
  reverse proxy / gateway rate limit in front if you scale to multiple app instances.
- Without the durable overlay, all app data lives in the `stocksense-data` volume only;
  back it up (`docker run --rm -v stocksense-data:/data -v $(pwd):/backup alpine tar czf
  /backup/stocksense-data.tgz /data`) before any operation that could remove volumes.
