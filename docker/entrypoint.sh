#!/bin/sh
set -e

# Make sure the volume directory is usable.
mkdir -p /app/data

# Sync the Prisma schema with the SQLite file. On a fresh volume this creates
# all tables; on an existing one it's a no-op when the schema already matches.
echo "[entrypoint] Applying Prisma schema to ${DATABASE_URL}…"
node /app/node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss

echo "[entrypoint] Starting Next.js…"
exec "$@"
