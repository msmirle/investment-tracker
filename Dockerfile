# syntax=docker/dockerfile:1.6
# Debian-based image (glibc) so Prisma engines work on linux/arm/v7 (Pi 2/3-32bit)
# in addition to amd64 and arm64.

# ---------- deps ----------
FROM node:20-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- builder ----------
FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:/tmp/build.db"
ENV NODE_OPTIONS="--max-old-space-size=2048"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public \
 && npx prisma generate \
 && npm run build

# ---------- runner ----------
FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates tini wget \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/app/data/dev.db"

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --no-create-home --shell /usr/sbin/nologin nextjs \
 && mkdir -p /app/data \
 && chown -R nextjs:nodejs /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/engines ./node_modules/@prisma/engines

COPY --chown=nextjs:nodejs docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER nextjs
EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
