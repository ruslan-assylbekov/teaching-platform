# syntax=docker/dockerfile:1

# Node 24 explicitly — Node 20 is end-of-life and Next.js 16 will not warn
# you if the base image drifts back to it (design spec §7.1).
FROM node:24-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
# npm 12 blocks @swc/core / @parcel/watcher install scripts by default.
# Do not approve them here — next build is verified green without them,
# and approving @parcel/watcher would pull node-gyp + a C++ toolchain into
# the image, which @node-rs/argon2 was chosen specifically to avoid.
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# postgresql-client (pg_dump) lives only in this stage, not in `runner` --
# the production app image never needs it, only scripts/backup.ts run
# through the `tools` service (docker-compose.yml, target: builder).
# Debian bookworm's own postgresql-client package resolves to PG15, but the
# server is 18.6 (design spec §7): an older pg_dump talking to a newer
# server is unsupported and can silently miss schema features, so this
# pulls postgresql-client-18 specifically from the official PGDG apt repo
# instead of the distro default.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-18 \
  && rm -rf /var/lib/apt/lists/*

FROM base AS runner
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
