# syntax=docker/dockerfile:1.6
# Multi-stage build for H+ Analytics — produces a small Node.js runtime image.
# Uses pnpm (project migrated from npm; pnpm-lock.yaml is the lockfile).

# ---------- Stage 1: build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install pnpm globally before anything else.
RUN npm install -g pnpm@10.26.1 --no-audit --no-fund

# Install deps separately to maximize Docker layer caching.
# pnpm install --frozen-lockfile enforces a clean, reproducible install.
COPY package.json pnpm-lock.yaml ./
RUN CI=true pnpm install --frozen-lockfile

# Copy the rest of the source and build.
COPY . .
RUN npm run build

# Prune to production deps only.
RUN CI=true pnpm install --frozen-lockfile --prod

# ---------- Stage 2: runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=5000

# Non-root user (node UID 1000 ships with the official image).
RUN chown -R node:node /app
USER node

# Bring over the built artifacts and pruned production deps.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
# Schemas / migrations / static assets that the runtime reads from disk.
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/docs ./docs

EXPOSE 5000

# `npm start` runs `node dist/index.cjs` per package.json.
CMD ["npm", "start"]
