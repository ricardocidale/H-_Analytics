# ============================================================
# Build stage
# ============================================================
FROM node:20-alpine AS build

WORKDIR /app

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy manifest files needed for dependency resolution before any source.
# pnpm install --frozen-lockfile requires every workspace package.json to
# exist at the paths declared in pnpm-workspace.yaml.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Workspace package manifests — one COPY per workspace glob:
#   artifacts/*
COPY artifacts/api-server/package.json          ./artifacts/api-server/package.json
COPY artifacts/hospitality-business-portal/package.json ./artifacts/hospitality-business-portal/package.json
COPY artifacts/mockup-sandbox/package.json      ./artifacts/mockup-sandbox/package.json
COPY artifacts/property-slides/package.json     ./artifacts/property-slides/package.json

#   lib/*
COPY lib/analytics/package.json       ./lib/analytics/package.json
COPY lib/api-client-react/package.json ./lib/api-client-react/package.json
COPY lib/api-spec/package.json        ./lib/api-spec/package.json
COPY lib/api-zod/package.json         ./lib/api-zod/package.json
COPY lib/calc/package.json            ./lib/calc/package.json
COPY lib/db/package.json              ./lib/db/package.json
COPY lib/domain/package.json          ./lib/domain/package.json
COPY lib/engine/package.json          ./lib/engine/package.json
COPY lib/shared/package.json          ./lib/shared/package.json

#   scripts
COPY scripts/package.json             ./scripts/package.json

# Install all dependencies (dev + prod) so the build can succeed.
RUN pnpm install --frozen-lockfile

# Copy full source tree (respects .dockerignore).
COPY . .

# Build everything: typecheck + per-package builds.
RUN pnpm run build

# ============================================================
# Runtime stage
# ============================================================
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Install pnpm so we can use it to prune if needed, and for corepack consistency.
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy the bundled api-server output from the build stage.
# The esbuild bundle externalises native modules (@aws-sdk/*, sharp, etc.)
# so we must also carry along the relevant node_modules.
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist

# Copy the production node_modules from the build stage.
# pnpm stores everything under the root node_modules with symlinks into
# .pnpm; copy the whole tree to keep symlinks intact.
COPY --from=build /app/node_modules          ./node_modules
COPY --from=build /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules

# Copy workspace lib builds needed at runtime
# (api-zod and db are workspace:* deps of api-server)
COPY --from=build /app/lib ./lib

# Copy root package.json so Node can resolve workspace package metadata.
COPY --from=build /app/package.json          ./package.json
COPY --from=build /app/pnpm-workspace.yaml   ./pnpm-workspace.yaml

EXPOSE 5000

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
