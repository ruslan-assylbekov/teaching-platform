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
