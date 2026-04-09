#!/bin/sh
set -e

# Ensure the data directory is writable by nextjs. On Linux hosts a bind-mounted
# volume at /app/data gets created root-owned the first time docker runs, which
# would break SQLite (SQLITE_CANTOPEN). Do this as root, then drop privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown -R nextjs:nodejs /app/data
  exec gosu nextjs "$0" "$@"
fi

# Running as nextjs from here on. The app runs its own drizzle migrations on
# boot via src/lib/db.ts, so we don't invoke drizzle-kit here.
exec "$@"
