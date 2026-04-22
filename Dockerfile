# syntax=docker/dockerfile:1.6
# Multi-stage build for H+ Analytics — produces a small Node.js runtime image.
# Mirrors the workflow: `npm install && npm run build && npm start`.

# ---------- Stage 1: build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install deps separately to maximize Docker layer caching.
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm install --include=dev --no-audit --no-fund

# Copy the rest of the source and build.
COPY . .
RUN npm run build

# Drop dev deps so we copy only what runtime needs.
RUN npm prune --omit=dev --no-audit --no-fund

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
