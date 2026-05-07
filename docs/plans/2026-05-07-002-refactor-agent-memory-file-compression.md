---
title: "Agent Memory File Compression — CLAUDE.md + replit.md"
type: refactor
status: active
date: 2026-05-07
---

# Agent Memory File Compression — CLAUDE.md + replit.md

## Summary

Reduce `CLAUDE.md` (715 lines) and `replit.md` (114 lines) to a leaner, lower-token-cost form without removing any inviolable rule, enforcement gate, or load-bearing architectural fact. Target: ~580 lines for `CLAUDE.md` (~19% reduction); ~100 lines for `replit.md`. The approach is extract-and-point, not delete — every fact that gets removed from the always-loaded files lands in a pointed-to reference doc or skill.

---

## Problem Frame

Both files are loaded in full at the start of every agent session. `CLAUDE.md` has grown to 715 lines through five weeks of accretion without a compression pass. Three patterns account for most of the bloat:

1. **Self-duplication inside CLAUDE.md.** The Number Taxonomy (§2, lines 35–53) and the "Architecture Notes: Number taxonomy — the permanent law" section (lines 458–483) cover the same ground twice at different levels of detail.

2. **Spec reference material embedded in an enforcement-reminder file.** The LB Slides section (lines 484–525, ~42 lines) is a dense implementation reference — route names, column names, slot logic, finance function calls. An agent working on billing, auth, or Rebecca doesn't need this pre-loaded. The §11 Frontend Design Standards block (lines 214–248, ~35 lines) embeds seven design principles that live in the skill already; the enforcement reminder needs only the gate trigger and a pointer.

3. **Changelog growth without a cap.** The "Recent Significant Changes" table has 7–10 entries averaging 50 words each. Without a cap, it grows ~15 lines per sprint. Keeping only the last 3–4 entries (one sprint's worth) is sufficient context for session continuity; older entries are stable history that adds no actionable value per session.

Secondary sources (each ~10–25 lines):
- Production Deployment inline secrets list (line 380) duplicates the §Environment Variables table.
- Intelligence Display Architecture Notes sub-section (~25 lines) can compress to 8 lines + pointer to skill.
- Reference Documents table contains slide-specific file paths already surfaced in the slide skills.

`replit.md` is already lean (114 lines), but its "Recent Significant Changes" table mirrors the same verbose entries and should be trimmed in lockstep.

---

## Goals

- `CLAUDE.md` ≤ 590 lines after compression (target: ~575).
- `replit.md` ≤ 105 lines after compression (target: ~100).
- Every fact removed from CLAUDE.md either (a) lives in a pointed-to skill/doc with a pointer added, or (b) is a true duplicate that already exists elsewhere in the file.
- No enforcement rule (§1–§12), inviolable auth rule, ADR-007, or architectural constraint is removed or weakened.
- Both files remain verbatim-identical for their shared sections per the `agent-memory-files` discipline.

## Non-Goals

- Do not reorganize §1–§12 (mandatory enforcement reminders). They are correctly always-loaded.
- Do not touch the skills table in § "Agent & Skill System". It drives routing decisions.
- Do not optimize plan docs (`docs/plans/*.md`) or solution docs (`docs/solutions/`). These are read on-demand, not pre-loaded.
- Do not change any production logic, routes, or migrations.

---

## Baseline Measurements

```
CLAUDE.md       715 lines   (as of 2026-05-07)
replit.md       114 lines   (as of 2026-05-07)
```

Section sizes (from header map):

| Section | Lines (approx) | Action |
|---|---|---|
| §1–§12 Mandatory rules | 13–271 (~260 lines) | Keep — enforcement reminders |
| Project Source of Truth | 273–278 (~6 lines) | Keep |
| Monorepo Structure | 279–303 (~25 lines) | Keep |
| Stack table | 304–326 (~23 lines) | Keep |
| Key Commands | 327–339 (~13 lines) | Keep |
| Environment Variables | 340–358 (~19 lines) | Keep |
| Production Deployment | 359–402 (~44 lines) | U004: compress |
| Architecture Notes — Import discipline | 403–411 | Keep |
| Architecture Notes — Zod compat | 412–416 | Keep |
| Architecture Notes — Rebecca only | 418–420 | Keep |
| Architecture Notes — Specialists | 422–424 | Keep |
| Architecture Notes — Intelligence Display | 426–450 (~25 lines) | U005: compress |
| Architecture Notes — Roles & permissions | 452–456 | Keep |
| Architecture Notes — Number taxonomy | 458–483 (~26 lines) | Keep (canonical); §2 compressed in U001 |
| Architecture Notes — LB Slides | 484–525 (~42 lines) | U003: extract |
| Architecture Notes — reference_brands | 526–533 | Keep |
| Architecture Notes — Auth rules | 535–545 | Keep |
| Architecture Notes — Known issues | 547–551 | U007b: move to separate doc |
| Architecture Notes — Migration system | 553–565 | Keep |
| Architecture Notes — Shared proxy | 566–570 | Keep |
| Canonical Page Archetypes | 572–583 | Keep |
| Reference Documents table | 585–607 (~23 lines) | U006: compress |
| Agent & Skill System | 610–685 (~75 lines) | Keep |
| Recent Significant Changes | 688–716 (~28 lines) | U007a: trim |

---

## Implementation Units

### U001 — Deduplicate Number Taxonomy

**Problem:** §2 "Number Taxonomy" (lines 35–53, ~20 lines) and the Architecture Notes sub-section "Number taxonomy — the permanent law (never re-derive)" (lines 458–483, ~26 lines) cover the same four categories with significant overlap. The Architecture Notes version is the canonical, detailed form including the three recurring violations and the canonical constants files list.

**Action:**
- Compress §2 from ~20 lines to 6 lines: keep the four-row category table, add one sentence pointing to § "Architecture Notes: Number taxonomy" for the full law, remove the masking anti-pattern code block and the duplicate "Skill for full detail" pointer (already present in the Architecture Notes version).
- Architecture Notes version stays verbatim as the canonical law.

**Estimated savings:** ~14 lines

**Files:** `CLAUDE.md`

**Acceptance:**
- §2 table still shows all four categories.
- Pointer to Architecture Notes version present.
- Architecture Notes version unchanged.
- `grep -c "DEFAULT_INFLATION_RATE" CLAUDE.md` returns 1 (one canonical location).

---

### U002 — Compress §11 Frontend Design Standards

**Problem:** §11 (lines 214–248, ~35 lines) contains seven design principles (typography, color, spatial composition, motion, backgrounds, AI-slop avoidance, implementation match) that live in full in the `frontend-design` / `ce-frontend-design` skills. The enforcement reminder only needs: (a) the gate trigger rule and (b) a pointer to the skill.

**Action:**
- Reduce §11 to ≤10 lines:
  - Keep: the mandate line ("invoke `/post-coding-design-review` before marking any frontend-touching unit complete")
  - Keep: the scope definition (any change to `.tsx`, `.jsx`, `.css`, `.scss`, `.html`)
  - Keep: the consequence ("A design finding is a build-failure-equivalent for UI work")
  - Keep: the skill pointer
  - Remove: the seven `**Principle**` bullet blocks
  - Remove: the inline plugin path to the skill file

**Estimated savings:** ~25 lines

**Files:** `CLAUDE.md`

**Acceptance:**
- §11 ≤10 lines.
- Gate trigger, scope, and consequence all still present.
- Skill pointer present.
- No design principles inline (they belong in the skill).

---

### U003 — Extract LB Slides Implementation Detail

**Problem:** The Architecture Notes "LB Slides — investor PDF decks" section (lines 484–525, ~42 lines) contains dense implementation reference: active route names, source file paths, finance function call signatures, DB schema column names, slot-logic details, and Admin UI component names. An always-loaded contract file is wrong for this material — it should live in a dedicated reference doc and be loaded only when working on that surface.

**Action:**
1. Create `docs/slide-system/lb-slides-implementation-reference.md` containing the full current LB Slides content (verbatim, so no information is lost).
2. Replace the CLAUDE.md section with an 8-line summary:
   ```
   ### LB Slides — investor PDF decks (Playwright HTML→PDF)

   Generates a 6-slide investor deck per property as a PDF matched to the
   canonical L+B reference deck. Slide 7 ("The Ask") is always excluded.

   **One pipeline:** React deck pages at `features/internal-deck/` → api-server
   opens headless Chromium (Playwright) → prints to PDF → uploads to R2 →
   serves back. Route: `GET /api/properties/:id/deck.pdf`.

   **Do not add Puppeteer.** Playwright is the single renderer. Legacy Python
   and satori tracks are removed.

   **Full implementation reference:** `docs/slide-system/lb-slides-implementation-reference.md`
   (route details, schema, finance calls, slot logic, visual spec paths, Admin UI component).
   ```

**Estimated savings:** ~34 lines in CLAUDE.md (content moves to reference doc, not deleted)

**Files:** `CLAUDE.md`, `docs/slide-system/lb-slides-implementation-reference.md` (new)

**Acceptance:**
- `docs/slide-system/lb-slides-implementation-reference.md` contains all content that was in the section verbatim.
- CLAUDE.md section ≤10 lines.
- Playwright-only rule, "no Puppeteer" note, and pointer to reference doc present in the summary.
- Reference doc pointer is an accurate relative path.

---

### U004 — Compress Production Deployment — Remove Inline Secrets Duplication

**Problem:** The "Required production env vars on Railway" paragraph (line 380) is a long run-on list of ~25 env var names, most of which already appear in the § "Environment Variables (api-server)" table above. The Dockerfile, railway.toml, and single-container model descriptions are load-bearing and must stay.

**Action:**
- Remove the inline secrets paragraph (line 380 block starting "POSTGRES_URL (Neon), SESSION_SECRET, TOKEN_ENCRYPTION_KEY…") and replace with: "All variables in §Environment Variables above are required in Railway service variables (no Replit broker is reachable in production). Additionally: `SESSION_SECRET`, `RESEND_API_KEY`, `SENTRY_DSN`, `NODE_ENV=production`."
- Keep the External services table (it provides service-to-secret mapping, which the env vars table does not).
- Keep all structural notes (Dockerfile, railway.toml, single-container model, Replit-role note).

**Estimated savings:** ~12 lines

**Files:** `CLAUDE.md`

**Acceptance:**
- No env var is removed from the overall doc (all still covered between the two sections).
- The externals services table is intact.
- The Dockerfile/railway.toml/single-container model block is intact.

---

### U005 — Compress Intelligence Display Architecture Notes

**Problem:** The "Intelligence Display — specialist-sourced UI affordances" sub-section (lines 426–450, ~25 lines) contains a data-flow diagram, three canonical component names with their props, conviction-floor semantics, voice-rule wording, and a severity color system. The `analyst-intelligence-display` skill already carries all of this in full. The Architecture Notes version should be a compact invariant statement + pointer.

**Action:**
- Reduce to 8 lines:
  - Invariant: "Every range badge, contextual tip, severity signal, or actionable suggestion must originate 100% from specialist/research-engine output. No component may hard-code a range, write its own advice, or derive a suggestion locally."
  - Canonical components list (one line): `AnalystRangeIndicator`, `AnalystVerdictDisplay`, `AnalystCheckDialog`
  - Severity colors (one line): ok=emerald, advisory=sky, warning=amber, block=red — no new levels
  - Pointer: "Full contract, data flow, conviction floor, voice rule, anti-patterns: `.agents/skills/analyst-intelligence-display/SKILL.md`"

**Estimated savings:** ~17 lines

**Files:** `CLAUDE.md`

**Acceptance:**
- Invariant statement present and matches current wording.
- Three canonical component names present.
- Severity colors present.
- Skill pointer present.
- No data-flow block or detailed props in Architecture Notes.

---

### U006 — Trim Reference Documents Table

**Problem:** The Reference Documents table (lines 585–607, ~23 lines) contains 15 entries. Several are slide-specific file paths that are already surfaced (with context) in the slide-related skills (`lb-slides-canonical-pngs`, `hplus-vision-templates`, `hplus-renovation-benchmarks`). Listing them here adds length without adding findability — an agent working on slides will load the slide skills anyway.

**Action:**
- Keep: `references/openapi.md`, `references/server.md`, `references/db.md`, `.local/tasks/task-800.md`, `.local/db-audit-phase-c-inventory.md`, canonical PDF reference, canonical PPTX source, machine-readable JSON extract, `docs/slide-system/canonical/coding-agent-instructions.md` (mandatory PNG comparison).
- Remove from table (keep in skills): three canonical brief `.txt` paths, canonical render spec v4 JSON (60 MB "do not parse"), and per-slide R2 PNGs (in `lb-slides-canonical-pngs` skill).
- Add the new implementation reference doc from U003: `docs/slide-system/lb-slides-implementation-reference.md`.

**Estimated savings:** ~6 lines

**Files:** `CLAUDE.md`

**Acceptance:**
- Core references (openapi, server, db, task-800, canonical PDF) all present.
- Slide-brief `.txt` paths removed (agents load `lb-slides-canonical-pngs` skill instead).
- New implementation reference doc pointer added.

---

### U007 — Trim Recent Significant Changes

**Problem:** The "Recent Significant Changes" table in `CLAUDE.md` has 7 entries (May 2–7, 2026), growing ~3–4 entries per sprint. Entries from more than one sprint ago (>7 days) add no session-continuity value — the changes they describe are already reflected in the codebase and the architecture notes. The table currently ends around 716 lines; uncapped, it will be 100 lines by end of month.

**Action (U007a — CLAUDE.md):**
- Keep the 4 most recent entries (2026-05-07 × 2 and 2026-05-05 × 2 — the current sprint).
- Remove the 3 entries from 2026-05-04 and earlier. These describe auth hardening decisions already captured in §"Inviolable login / auth rules", Google OAuth iframe fix captured in auth rule 4, and CE plugin install already stable.
- Add a cap comment below the table: `<!-- keep the latest 4 entries; remove older ones when adding new ones -->`.

**Action (U007b — Known Issues):**
- The "Known issues to address" sub-section (lines 547–551, 3 bullet points) is transient state, not an architectural contract. Move to a `docs/issues/known-issues.md` file and replace with a single pointer line.

**Action (U007c — replit.md):**
- Trim replit.md "Recent Significant Changes" to the same 4 entries as CLAUDE.md (they mirror each other).
- Add the same cap comment.

**Estimated savings:** ~20 lines total (CLAUDE.md ~17, replit.md ~3)

**Files:** `CLAUDE.md`, `replit.md`, `docs/issues/known-issues.md` (new)

**Acceptance:**
- CLAUDE.md Recent Changes ≤ 4 entries.
- replit.md Recent Changes ≤ 4 entries (same entries).
- `docs/issues/known-issues.md` contains the 3 bullets (email-existence leak, Iris `temperature+top_p`, `PROJECTION_YEARS` alias).
- Known issues section in CLAUDE.md replaced by pointer.
- Cap comment present in both files.

---

## Execution Order

Units are independent and can be applied in any order. Suggested sequence for minimal cognitive overhead:

1. **U007** first — trim changelog and known issues (simplest, low risk, immediate line count drop)
2. **U001** — dedup number taxonomy (high-confidence, no new files)
3. **U002** — compress §11 (no new files)
4. **U005** — compress intelligence display notes (no new files)
5. **U003** — extract LB Slides (requires creating reference doc)
6. **U004** — compress production deployment
7. **U006** — trim reference documents table

---

## Verification

After all units applied:

```bash
wc -l CLAUDE.md replit.md
# CLAUDE.md should be ≤ 590 lines
# replit.md should be ≤ 105 lines

# Confirm no enforcement rule removed:
grep -c "MANDATORY GATE\|NEVER\|MUST\|Inviolable\|non-negotiable" CLAUDE.md
# Should return >= 20

# Confirm all §1-12 headers still present:
grep "^## [0-9]" CLAUDE.md
# Should show 12 headers

# Confirm pointers to extracted content exist:
grep "lb-slides-implementation-reference" CLAUDE.md
grep "docs/issues/known-issues" CLAUDE.md

# Confirm no broken references to removed lines:
grep "Number taxonomy — the permanent law" CLAUDE.md  # should still find Architecture Notes section
grep "analyst-intelligence-display" CLAUDE.md          # pointer still present
```

**Memory-file harmonization gate:** After all edits, scan `replit.md` against `CLAUDE.md` shared sections (Inviolable Rules, Gotchas, Pointers table, Recent Changes) and confirm identical wording per `agent-memory-files` discipline. Any divergence found during the scan is a bug to fix before marking complete.

---

## Expected Outcome

| File | Before | After | Δ |
|---|---|---|---|
| `CLAUDE.md` | 715 lines | ~575 lines | −140 lines (−20%) |
| `replit.md` | 114 lines | ~100 lines | −14 lines (−12%) |
| `docs/slide-system/lb-slides-implementation-reference.md` | (new) | ~45 lines | +45 |
| `docs/issues/known-issues.md` | (new) | ~10 lines | +10 |

Net information: zero loss. All extracted facts are in pointed-to files with explicit pointers in CLAUDE.md. All enforcement rules, inviolable constraints, and architectural invariants remain in the always-loaded files.
