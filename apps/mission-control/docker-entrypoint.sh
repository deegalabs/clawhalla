#!/bin/sh
set -e

# Run migrations on every start so the volume-mounted DB is always up to date
pnpm drizzle-kit generate --silent 2>/dev/null || true
pnpm drizzle-kit migrate --silent 2>/dev/null || true

exec "$@"
