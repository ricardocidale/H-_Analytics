# syntax=docker/dockerfile:1
# Multi-stage build — builder installs everything and compiles,
# runtime stage ships only what's needed at production.

# ── Stage 1: Builder ──────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN npm install -g pnpm@10.26.1

WORKDIR /app

# Install dependencies (separate layer from source for cache efficiency)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source and build
COPY . .
ENV NODE_ENV=production
RUN pnpm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Install only production dependencies
RUN npm install -g pnpm@10.26.1

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Non-root user for security
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

# Health check aligned with railway.json healthcheckPath
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health/ready || exit 1

CMD ["node", "dist/index.cjs"]
