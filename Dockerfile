# syntax=docker/dockerfile:1.6
# ---------- deps ----------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# postinstall runs prisma generate, which needs the schema.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- builder ----------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL is required for `prisma generate` during build, but no real DB
# is hit. The runtime value is supplied via the entrypoint.
ENV DATABASE_URL="file:/tmp/build.db"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
 && npm run build

# ---------- runner ----------
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl tini
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# SQLite database lives on a mounted volume so it survives container rebuilds.
ENV DATABASE_URL="file:/app/data/dev.db"

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && mkdir -p /app/data \
 && chown -R nextjs:nodejs /app

# Standalone Next output is self-contained.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma schema + the generated client binaries we need to run `db push`
# at startup against the mounted SQLite file.
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

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
