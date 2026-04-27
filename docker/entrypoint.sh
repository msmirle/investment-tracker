#!/bin/sh
set -e

APP_UID=1001
APP_GID=1001
DATA_DIR=/app/data

# Ensure the data directory exists and is owned by the app user. This
# matters most for bind mounts, where the host directory's ownership
# leaks through and may not be 1001:1001.
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  # Only chown when the directory isn't already owned correctly, to keep
  # startup fast on big volumes.
  current_uid=$(stat -c '%u' "$DATA_DIR")
  current_gid=$(stat -c '%g' "$DATA_DIR")
  if [ "$current_uid" != "$APP_UID" ] || [ "$current_gid" != "$APP_GID" ]; then
    echo "[entrypoint] Fixing ownership of $DATA_DIR ($current_uid:$current_gid -> $APP_UID:$APP_GID)"
    chown -R "$APP_UID:$APP_GID" "$DATA_DIR"
  fi
  # Re-exec the rest of the script as the unprivileged app user.
  exec su-exec "$APP_UID:$APP_GID" "$0" "$@"
fi

# Sync the Prisma schema with the SQLite file. On a fresh volume this creates
# all tables; on an existing one it's a no-op when the schema already matches.
echo "[entrypoint] Applying Prisma schema to ${DATABASE_URL}…"
node /app/node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss

echo "[entrypoint] Starting Next.js…"
exec "$@"
