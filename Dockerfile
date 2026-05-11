# ============================================================
# Build stage
# ============================================================
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

# Copy manifest files needed for dependency resolution before any source.
# pnpm install --frozen-lockfile requires every workspace package.json to
# exist at the paths declared in pnpm-workspace.yaml.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Workspace package manifests — one COPY per workspace glob:
#   artifacts/*
COPY artifacts/api-server/package.json          ./artifacts/api-server/package.json
COPY artifacts/hospitality-business-portal/package.json ./artifacts/hospitality-business-portal/package.json
COPY artifacts/mockup-sandbox/package.json      ./artifacts/mockup-sandbox/package.json

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

# Vite requires PORT and BASE_PATH at build time. Each frontend artifact has
# a different base path (the API server proxies them at distinct sub-paths in
# production), so we build them one-by-one with the correct BASE_PATH set per
# build instead of relying on a single workspace-wide value.
ARG PORT=5000
ENV PORT=$PORT

# Typecheck the whole workspace once (composite libs + leaf packages).
# Defensive: explicit copy of seed file in case ignore rules drop it
COPY artifacts/api-server/seed/seed-production.sql /app/dist/seed-production.sql

RUN pnpm run typecheck

# Build each frontend artifact with its own BASE_PATH.
#   - hospitality-business-portal -> served at "/"
#   - mockup-sandbox              -> served at "/__mockup/"
RUN BASE_PATH=/ pnpm --filter @workspace/hospitality-business-portal run build
RUN BASE_PATH=/__mockup/ pnpm --filter mockup-sandbox run build

# Build the API server bundle last (depends on lib builds via tsc).
RUN pnpm --filter @workspace/api-server run build

# ============================================================
# Runtime stage
# ============================================================
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Install pnpm so we can use it to prune if needed, and for corepack consistency.
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

# Headless Chromium for Playwright PDF rendering (per-property investor decks).
# `npx playwright install --with-deps chromium` installs both the apt system
# libraries (libnss3, libxkbcommon, fonts, etc.) and the chromium binary into
# /ms-playwright. Run AFTER node_modules is in place so the playwright package
# is resolvable.

# Copy the bundled api-server output from the build stage.
# The esbuild bundle externalises native modules (@aws-sdk/*, sharp, etc.)
# so we must also carry along the relevant node_modules.
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist

# Frontend SPAs — served by the API server via serveStatic()
#   - hospitality-business-portal -> ./artifacts/api-server/dist/public            (mounted at "/")
#   - mockup-sandbox              -> ./artifacts/api-server/dist/mockup-sandbox    (mounted at "/__mockup/")
COPY --from=build /app/artifacts/hospitality-business-portal/dist/public ./artifacts/api-server/dist/public
COPY --from=build /app/artifacts/mockup-sandbox/dist                     ./artifacts/api-server/dist/mockup-sandbox

# Production seed SQL — loaded at first boot to sync canonical data.
# Source-of-truth lives in artifacts/api-server/seed/ (committed to git);
# we stage it under /app/dist/ at runtime to match the path the api-server
# checks first (process.cwd()/dist/seed-production.sql).
COPY --from=build /app/artifacts/api-server/seed/seed-production.sql ./dist/seed-production.sql

# Drizzle migrations — required at runtime by `migrate(db, { migrationsFolder:
# "./migrations" })` in src/index.ts. The migrate() runner reads each SQL file
# plus meta/_journal.json from disk; without this COPY the container boots,
# binds the port, then crashes with:
#   FATAL: Schema migrations failed: Can't find meta/_journal.json file
# Path matches the relative folder the runner expects (process.cwd()/migrations).

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

# Install headless Chromium + its system libraries for Playwright PDF rendering.
# Done here so playwright is resolvable from the copied node_modules. Browsers
# land in /ms-playwright (default cache path); --with-deps runs the apt install
# of nss, fonts, libxkbcommon, etc.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Drizzle migrations - bootstrapDrizzleMigrationState() reads ./migrations relative to cwd
COPY --from=build /app/artifacts/api-server/migrations ./migrations

# LibreOffice headless + Liberation/Noto fonts for Factory v2 PPTX → PDF conversion.
# `libreoffice-impress` is the minimal slice that handles .pptx; `--no-install-recommends`
# keeps the image lean (drops Java doc-import helpers, sample templates, etc.).
# Fonts: liberation (Times/Helvetica/Courier metric equivalents), noto-core (broad
# Latin/Greek/Cyrillic coverage), noto-cjk (CJK fallback so Asian text doesn't render
# as tofu). Georgia and Poppins are intentionally NOT installed — see
# docs/solutions/integration-issues/libreoffice-headless-railway-install-2026-05-11.md
# for the fidelity-vs-licensing tradeoff (Georgia ships via the EULA-prompt
# ttf-mscorefonts-installer; Poppins is not in Debian repos). Liberation Serif is
# the documented substitute for Georgia in the canonical deck.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       libreoffice-impress \
       fonts-liberation \
       fonts-noto-core \
       fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

RUN pnpm --filter @workspace/api-server exec playwright install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/*

EXPOSE 5000

CMD ["node", "--enable-source-maps", "--import", "./artifacts/api-server/dist/instrument.mjs", "artifacts/api-server/dist/index.mjs"]
