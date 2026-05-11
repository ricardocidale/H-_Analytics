---
title: "LibreOffice headless on Railway — install layer, fonts, fidelity caveats"
date: 2026-05-11
category: integration-issues
module: dockerfile/factory-v2
problem_type: integration_issue
component: deployment
severity: medium
symptoms:
  - "soffice not on PATH in Railway container before this PR"
  - "Factory v2 needs PPTX → PDF conversion in production"
root_cause: missing_runtime_dependency
resolution_type: dockerfile_addition
tags: [factory-v2, libreoffice, soffice, dockerfile, railway, fonts, pptx]
related_plan: docs/plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md
related_units: [U2, U7, U10]
---

# LibreOffice headless on Railway — install layer, fonts, fidelity caveats

**Status:** Active. Installed in the Dockerfile runtime stage as of PR shipping U2 of Factory v2.

## Context

Factory v2 (see plan `2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md`) renders every run as a substituted PPTX, then exports a PDF *from the PPTX* via `soffice --headless --convert-to pdf`. This satisfies R2 (dual-format, drift-proof output) and R6 (slide 6 income statement rendered to PNG and embedded as an image).

Before this PR, the Railway runtime image carried Playwright + headless Chromium but no LibreOffice / `soffice` binary. Factory v2's renderer pipeline (U7) and Maya inspector pivot (U10) both depend on `soffice` being on PATH.

## Install layer

A new `RUN` invocation in the Dockerfile runtime stage:

```dockerfile
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       libreoffice-impress \
       fonts-liberation \
       fonts-noto-core \
       fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*
```

It precedes the existing Playwright install line so the apt caches are reused before Playwright's own apt step removes them. `--no-install-recommends` keeps the image lean (drops sample templates, Java doc-import helpers, broad fontconfig recommendations).

### Why `libreoffice-impress` and not `libreoffice` or `libreoffice-core`

- `libreoffice` (the meta-package) pulls in Writer, Calc, Draw, Math, Base — ~600 MB+ of surface we never use.
- `libreoffice-core` is the lowest-level runtime but does NOT include the Impress filter set; `--convert-to pdf` on a `.pptx` fails because the import filter is missing.
- `libreoffice-impress` is the minimal slice that loads Impress + the PPTX import filter and exports to PDF. Pulls in `libreoffice-core` as a dependency automatically.

## Fonts and fidelity caveats

The plan's U2 goal text mentions **Noto, Liberation, Georgia, Poppins**. The apt-install line in the plan's approach section lists only **liberation, noto-core, noto-cjk**. This doc resolves the conflict.

| Font | Installed via | Notes |
|---|---|---|
| **Liberation Sans / Serif / Mono** | `fonts-liberation` | Metric-compatible substitutes for Helvetica / Times / Courier. Free, ships with Debian. Used as the fallback for any missing common serif/sans body fonts. |
| **Noto family (Latin/Greek/Cyrillic)** | `fonts-noto-core` | Broad coverage so substituted property names and admin-edited text in non-English Latin-extended scripts render correctly. |
| **Noto CJK** | `fonts-noto-cjk` | Prevents tofu boxes if any source PPTX or substituted text contains CJK characters. |
| **Georgia** | NOT installed | `ttf-mscorefonts-installer` is gated behind a EULA prompt and breaks the `--no-install-recommends` clean-install pattern. LibreOffice falls back to **Liberation Serif**, which is metric-compatible with Georgia at standard body sizes. Documented fidelity gap: tracking on capital glyphs (especially Q, R) differs slightly; in slide-deck body text this is imperceptible at typical zoom levels. |
| **Poppins** | NOT installed | Not packaged in Debian repos. Would require fetching from Google Fonts CDN at image-build time, which we explicitly avoid (network dependence at build time, license drift surface). LibreOffice falls back to the default sans-serif (Liberation Sans / Noto Sans depending on fontconfig priority). Documented fidelity gap: Poppins is geometric; Liberation Sans is humanist — letterforms differ noticeably at display sizes. Mitigation: any v7 canonical slide that depends on Poppins-specific shapes should be flagged in the Lorenzo canonical spec so Maya's diff tolerance for that bbox can be tuned. |

If a future canonical refresh hard-requires Georgia or Poppins fidelity, the upgrade path is:

1. **Georgia:** add a separate `RUN` that accepts the EULA non-interactively (`ACCEPT_EULA=Y apt-get install ttf-mscorefonts-installer`) — license review required before this lands.
2. **Poppins:** add the font file directly via `COPY` from a vendored copy in the repo, or fetch from a pinned GitHub release at build time. Pin a specific SHA.

## Conversion contract

The U7 wrapper module spawns:

```bash
soffice --headless --convert-to pdf --outdir <tmp> <input.pptx>
```

Exit-code mapping:
- `0` — PDF written to `<tmp>/<basename>.pdf`. Success.
- `1` — Generic failure (malformed input, font init failure, profile lock). Logged and retried once with a fresh profile dir.
- `77` — Permission-denied on profile dir. Indicates concurrent invocation on the same user profile; U7 uses per-run profile dirs to avoid this.

Per-invocation profile dir: `--user-profile=file:///tmp/factory-runs/<runId>/lo-profile/` (set up in U7) to avoid the well-known "Stale lockfile" wart of running multiple `soffice` instances concurrently in a single container.

## Image-size delta

The runtime image grows by approximately **180–230 MB** (LibreOffice core + Impress + the three font packages). The pre-PR image was ~1.5 GB (Node 20 + Playwright Chromium + system libs); post-PR is ~1.7 GB.

If a future audit pushes us under a hard image-size cap, the lever is to switch from `libreoffice-impress` to a hand-curated subset (drops further ~50 MB, loses some niche import filters).

## Smoke verification

After image build, the running container responds to:

```bash
soffice --version
# expected: LibreOffice 7.x.y / 24.x.y (depends on Debian bookworm release stream)
```

A Vitest integration test at `artifacts/api-server/src/tests/slides/soffice-smoke.test.ts` is the captured form of the smoke contract. It is gated on `soffice` being on PATH, so it:

- Runs on Railway (where the binary is present after this PR).
- No-ops locally and in any CI environment that hasn't rebuilt the runtime image yet.

The test creates a one-slide PPTX via `pptxgenjs`, runs the conversion, and asserts:

1. Exit code `0`.
2. Output PDF exists and is non-empty.
3. The PDF starts with the `%PDF-` magic bytes.

## Known fidelity caveats vs. real PowerPoint

| Aspect | LibreOffice behavior | Mitigation |
|---|---|---|
| Font fallback | Substitutes missing fonts with closest available (per fontconfig). Subtle glyph-level differences. | Maya pixel-diff tolerance (`±2px` baseline) absorbs sub-glyph drift. Per-slide carve-outs documented in U10. |
| Embedded video / animation | Stripped on PDF export. | Factory v2 does not use animation; canonical decks are static. |
| OLE objects / charts authored in PowerPoint | May lose interactivity, but rendered representation preserved. | Slide 6 uses embedded-PNG pattern (R6), not native chart objects, so this is moot for the factory's path. |
| Theme inheritance edge cases | Rare cases where LibreOffice resolves a theme color slightly differently than PowerPoint. | Maya pixel-diff catches; per-slot color constants live in the substitution map, not the theme, so resolution path is short. |
| Text autofit on overflow | LibreOffice's autofit algorithm differs subtly from PowerPoint. | Factory v2's substitution engine (U4) enforces a 5%/20% character budget gate upstream; autofit is rarely invoked. |

The admin's downstream hand-edit step in PowerPoint is the safety net for any cell where LibreOffice rendering doesn't match PowerPoint exactly — they open the PPTX (not the PDF) and the original authoring application reconciles.

## Related work

- U2 (this unit) — adds the install layer.
- U7 — wraps `soffice` as a subprocess with retry/timeout/cleanup. Uses `admin_resources` (kind `api`) for the binary path and `admin_parameters` for timeout, per the no-hardcoded-integration-identifiers convention.
- U10 — Maya inspector consumes `soffice --convert-to png` output for pixel-diff against canonical PNGs.

## Verification log

| Date | Environment | Check | Result |
|---|---|---|---|
| 2026-05-11 | Railway production runtime | `soffice --version` | Pending first deploy post-PR-merge |
| 2026-05-11 | Local docker build (`docker build --target runtime`) | Build succeeds, layer measured | Captured in PR description |
| 2026-05-11 | Vitest `soffice-smoke.test.ts` | Skips locally, runs on Railway | Test landed skip-guarded |
