# syntax=docker/dockerfile:1.7
#
# StockSense Pro - production Docker image
# Multi-stage build: install deps -> build (Next.js standalone output) -> minimal runtime.
#
# Build:
#   docker build -t stocksense-pro .
# Run (simple, local JSON-file storage, persisted via a named volume):
#   docker run -p 3000:3000 --env-file .env -v stocksense-data:/app/data stocksense-pro
#
# For a docker-compose based setup (including optional durable Redis storage) see
# docker-compose.yml, docker-compose.durable.yml and DOCKER.md.

ARG NODE_VERSION=20

##############################################################################
# 1. deps - install dependencies with pnpm (cached separately from source)
##############################################################################
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app

# Some transitive deps (sharp, @tailwindcss/oxide, etc.) may need to build a native
# addon if a prebuilt binary isn't published for this platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

##############################################################################
# 2. builder - compile the Next.js app (standalone output)
##############################################################################
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ is optional in this project; make sure it always exists so the runtime
# stage's COPY never fails, whether or not the repo happens to ship one.
RUN mkdir -p public

# NEXT_PUBLIC_* variables are inlined into the client bundle at build time, so they
# must be supplied as build args, not just runtime environment variables.
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
ENV NEXT_TELEMETRY_DISABLED=1

# A GEMINI_API_KEY is not required to build - lib/gemini.ts falls back to a
# deterministic narrative when it is absent, both at build and at runtime.
RUN pnpm run build

##############################################################################
# 3. runner - minimal production image
##############################################################################
FROM node:${NODE_VERSION}-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /app/data \
  && chown -R nextjs:nodejs /app

# Standalone output ships a pruned node_modules + server.js; static assets and public/
# are not included by Next.js standalone tracing and must be copied in separately.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Local JSON-file storage lives here (data/stocksense-db.json). Mount a volume on this
# path for persistence; without it, data resets whenever the container is recreated -
# use the KV_REST_API_URL/KV_REST_API_TOKEN env vars (see docker-compose.durable.yml)
# for real durable storage instead.
VOLUME ["/app/data"]

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('node:http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',res=>process.exit(res.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
