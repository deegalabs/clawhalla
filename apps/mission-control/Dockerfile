# ── Stage 1: Install dependencies ──────────────────────────────────
FROM node:24-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@10.28.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────
FROM node:24-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@10.28.1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p data
RUN pnpm build

# ── Stage 3: Production runtime ───────────────────────────────────
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs && \
    apt-get update && apt-get install -y --no-install-recommends gosu && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g pnpm@10.28.1

# Copy standalone output + static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy drizzle config + migrations for entrypoint
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/lib/schema.ts ./src/lib/schema.ts
COPY --from=builder /app/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=builder /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# Entrypoint runs migrations then starts
COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Data directory for SQLite (mount a volume here).
# The entrypoint runs as root so it can chown the bind-mounted volume
# (which Docker creates root-owned on Linux hosts) before dropping to nextjs.
RUN mkdir -p data && chown nextjs:nodejs data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
