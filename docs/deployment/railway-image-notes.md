# Railway Image Notes

Operational notes for the Railway production image (built from the repo `Dockerfile`).

## Image layers (high-level)

Two-stage build, runtime stage is what ships:

1. **Build stage** (`node:20-bookworm-slim AS build`) — pnpm install, typecheck, build every artifact (api-server bundle via esbuild, hospitality-business-portal SPA, mockup-sandbox SPA).
2. **Runtime stage** (`node:20-bookworm-slim AS runtime`) — copies the bundled api-server and both SPAs, copies node_modules (heavy deps externalized), copies migrations, installs:
   - **LibreOffice headless + fonts** (Factory v2 PPTX → PDF conversion)
   - **Playwright headless Chromium + system libs** (LB-deck PDF rendering)

The api-server serves `/api/*` plus both SPAs from one process on one port — single-container model. See `CLAUDE.md` § "Production Deployment" for the deployment contract.

## System binary dependencies

| Binary | Install method | Purpose | Added |
|---|---|---|---|
| `node` | base image (`node:20-bookworm-slim`) | runtime | always |
| `pnpm` | corepack | install discipline | always |
| Chromium + libs | `playwright install --with-deps chromium` | LB-deck PDF rendering | always (legacy) |
| `soffice` (LibreOffice Impress) | `apt-get install libreoffice-impress` | Factory v2 PPTX → PDF | 2026-05-11 (PR shipping U2 of factory-v2 plan) |
| Liberation / Noto / Noto CJK fonts | `apt-get install fonts-{liberation,noto-core,noto-cjk}` | Font fallback for soffice rendering | 2026-05-11 |

## Image-size budget

Pre-Factory-v2: ~1.5 GB
Post-Factory-v2 (LibreOffice + fonts added): ~1.7 GB

The 200 MB delta is acceptable within Railway's image-size guidance. If a future audit pushes against a hard cap, the lever is a curated LibreOffice subset (see `docs/solutions/integration-issues/libreoffice-headless-railway-install-2026-05-11.md` § "Image-size delta").

## Verification commands

Run inside the running Railway container (via `railway run` or shell-in):

```bash
node --version              # expect v20.x
pnpm --version              # expect 10.26.1
soffice --version           # expect LibreOffice 7.x or 24.x (Debian bookworm stream)
ls /ms-playwright/chromium* # expect at least one chromium directory
```

The api-server's `/api/health/live` endpoint additionally exercises DB connectivity and is the Railway healthcheck target (configured in `railway.toml`, timeout 300s).

## Related docs

- `CLAUDE.md` § "Production Deployment" — full Railway contract
- `docs/solutions/integration-issues/libreoffice-headless-railway-install-2026-05-11.md` — LibreOffice install rationale, font choices, fidelity caveats
- `docs/solutions/integration-issues/dev-login-empty-body-edge-proxy-2026-05-02.md` — why we moved off Replit Publish to Railway
- `docs/solutions/performance-issues/api-server-bundle-size-externalize-heavy-deps-2026-05-02.md` — bundle externalization that keeps the api-server slim and shifts heavy deps to runtime install
