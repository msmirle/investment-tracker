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

# Optional HTTPS front-end. Activated when both TLS_CERT_FILE and TLS_KEY_FILE
# are set and readable. Mount your self-signed cert/key into the container and
# point these env vars at them (see docker-compose.yml for an example).
if [ -n "$TLS_CERT_FILE" ] && [ -n "$TLS_KEY_FILE" ]; then
  if [ -r "$TLS_CERT_FILE" ] && [ -r "$TLS_KEY_FILE" ]; then
    HTTPS_PORT="${HTTPS_PORT:-3443}"
    export HTTPS_PORT
    echo "[entrypoint] Starting HTTPS proxy on :${HTTPS_PORT} (cert=${TLS_CERT_FILE})"
    node /app/docker/https-proxy.js &
  else
    echo "[entrypoint] WARNING: TLS_CERT_FILE or TLS_KEY_FILE not readable; skipping HTTPS"
  fi
fi

echo "[entrypoint] Starting Next.js…"
exec "$@"
