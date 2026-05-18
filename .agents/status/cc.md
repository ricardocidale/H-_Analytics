# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-18T14:00:00Z
Status: idle

## Active Branch

`main` at `485a7d02d`, ahead of `origin/main` by 7 commits.

## Last Commit on Branch

`485a7d02d` — `test(documents): add unit tests for parseMistralOcrPages adapter`

## What CC Did This Session (2026-05-18 session 16)

**Shipped unit tests for parseMistralOcrPages (T3-1 U8 follow-up, commit `485a7d02d`).**

- Exported `parseMistralOcrPages` and `MISTRAL_OCR_TABLE_CONFIDENCE` from `routes/documents.ts` (the function was previously unexported, blocking test isolation).
- Added `artifacts/api-server/src/tests/mistral-ocr-adapter.test.ts` — 12 tests covering all three adapter behaviors:
  - 0-based Mistral `index` → 1-based `pageNumber` (including non-zero index offsets)
  - GFM separator-row skipping (`|---|---|`, `:---:`, spaced `| --- |`)
  - 2-column rows → `keyValuePairs` at `MISTRAL_OCR_TABLE_CONFIDENCE = 0.8`; 3+ column rows not promoted
  - Pages with no table rows excluded from `result.pages`; text accumulated regardless
  - Empty input guard
- All 12 tests pass. `typecheck` clean. `check-magic-numbers` PASS.

**Shipped `/ce-compound-refresh` docs updates (commits `9918b582b`, earlier this session).**

- `docs/solutions/architecture-patterns/lorenzo-vision-pipeline-canonical-ingestion-2026-05-07.md` — added Class 5 regex literal false-positives (both `{6}` quantifier AND `[a-z0-9]` character-class variants); removed drifted `LORENZO_VISION_MODEL` constant entry; added note on runtime `resolveLorenzoVisionModelId()`.
- `docs/solutions/tooling/magic-numbers-ratchet-improvements.md` — bumped "four classes" → "five classes"; added Class 5 full entry with both patterns and prevention bullet.

---

## What CC Did Previous Session (2026-05-18 session 15)

**Shipped T2-6 CC portion — brand CRUD API routes (commit `893a04868`).**

- `routes/admin/fees.ts`: added `POST /api/admin/brands` (create brand with slug + metadata) and `PATCH /api/admin/brands/:slug` (update display name / metadata). No new schema — `business_brands` table already covers all needed columns. `isDefault` is never writable via these routes (migration-only invariant preserved). Slug uniqueness enforced with explicit duplicate check before insert.
- Replit can now build the admin UI on top of these routes (T2-6 UI portion — the create/edit brand form under Model Default Management Co → Brands tab).
- T2-6 CC scope complete. UI portion is Replit-safe.
- Both gates passed: `typecheck` clean, `check-magic-numbers` PASS.

**Shipped T3-1 Matteo U8 — PDF OCR routing through Mistral OCR 3 (commit `776085c98`).**

- `routes/documents.ts`: `runAnalysisPipeline` now checks `matteo-enable-pdf-ocr-extraction` parameter flag. Flag on + PDF → Mistral OCR 3 via `getMistralOcrClient()`. Flag off or non-PDF → unchanged Google DocumentAI path.
- `parseMistralOcrPages()` adapter converts Mistral markdown pages into `DocumentAIResult` shape (`pages[].tables[].bodyRows`, `keyValuePairs`) for `mapExtractionToFields()`.
- `logApiCost()` emits JSONL cost line (`service=mistral`, `operation=pdf-ocr-extraction`, cost = `pageCount * unitCost("mistral-ocr-page")`).
- `MISTRAL_OCR_TABLE_CONFIDENCE = 0.8` named calibration constant (algorithm heuristic, not financial).
- Parity map updated with T3-1 U8 slot routing audit entries (both call sites: pdf-ocr-extraction + bulk-text-synthesis).
- All T3-1 Matteo Model Router units (U1–U8) now complete.
- Both verification gates passed: `pnpm run typecheck` clean, `check-magic-numbers.ts` PASS.

**Previous session (2026-05-17 session 14): shipped cross-platform Claude Code permission-bypass installers — PR #161 squash-merged to main as `4f29261c4`.**

Diagnosed and worked around three open Anthropic bugs that make permission-prompt suppression unreliable in Claude Code 2.1.x:
- [anthropics/claude-code#34923](https://github.com/anthropics/claude-code/issues/34923) — `permissions.defaultMode: "bypassPermissions"` in settings.json is silently broken.
- [anthropics/claude-code#29026](https://github.com/anthropics/claude-code/issues/29026) — Desktop app ignores both `permissions.allow` and `defaultMode` bypass.
- [anthropics/claude-code#55095](https://github.com/anthropics/claude-code/issues/55095) — Desktop's in-app bypass toggle is a no-op.

**Shipped (now on main):**
- `scripts/install-claude-wrapper.sh` — Linux/Mac installer. Drops a portable shim at `~/.local/bin/claude` that resolves the real claude binary by skipping itself on PATH and exec's it with `--dangerously-skip-permissions`. Includes a size-based safety check that refuses to overwrite a native install (>100 KB at target path).
- `scripts/install-claude-wrapper.ps1` — Windows PowerShell installer. Drops `claude.cmd` at `%USERPROFILE%\.claude-bypass\bin\` (separate directory, prepended to user PATH) to avoid the PATHEXT collision where `.exe` beats `.cmd` in the same directory. Includes OneDrive/Dropbox hazard detection. Uses `[Environment]::SetEnvironmentVariable(..., 'User')` to dodge `setx` 1024-char truncation.

**Verification:**
- Linux: removed `~/.local/bin/claude` → fell back to npm binary → ran installer → wrapper restored → bash trace confirmed `exec real-claude --dangerously-skip-permissions --version`. Real-tool-call smoke test via `claude -p` Bash invocation echoed the marker through the wrapper.
- Windows: verified end-to-end on the repo owner's native Claude Code 2.1.133 at `C:\Users\ricar\.local\bin\claude.exe` (225 MB compiled binary). `where.exe claude` showed `.claude-bypass\bin\claude.cmd` first, real `.exe` second. `claude --model haiku -p` echoed the marker through the shim — bypass confirmed active.
- Desktop (Mac & Windows): 🔴 no working bypass in 2.1.x. Use CLI for unattended workflows until fixed upstream.

**Per-machine setup also done on this Replit (not committed, gitignored):**
- `~/.local/bin/claude` wrapper installed and live.
- `~/.claude/settings.json`: dead `skipDangerousModePermissionPrompt: true` key removed.
- `.claude/settings.local.json` allowlist expanded to broad `[Bash, Edit, Write, WebFetch, WebSearch]` as a wrapper-less fallback for this box only.

**Branch hygiene:**
- Worked on `chore/claude-wrapper` (off main) for the PR.
- Deleted `feat/portal-followups` (post-merge stub from PR #160 with no unique work) — deletion authorized by user; recovery via reflog if needed (`d11cb426e`).
- Pruned 17 stale remote-tracking refs as a side effect of `git remote prune origin`.

**Protocol override (one-time, user-authorized):** Edited `.agents/status/replit.md` to mark Replit's Phase 3 handoff to CC as resolved (Phase 3 = `gaspar → gustavo` rename, shipped in PR #160). The protocol says Replit is the sole writer of that file; the override was scoped to a single targeted edit and clearly labeled in-file with a `[CC note — user-authorized]` block. Original handoff text preserved (struck-through) for session-log continuity. Commit `40bcf3ca3`.

**Compound documentation captured (`/ce-compound` full mode, commit `27463422a`):** `docs/solutions/tooling-decisions/claude-code-permission-bypass-path-shim-2026-05-17.md` — knowledge-track learning that documents the cross-platform CLI permission-bypass strategy, the three upstream bugs that necessitate it (#34923, #29026, #55095), the Windows PATHEXT collision pitfall, the `setx` truncation gotcha, the `claude -p` smoke-test pattern, and the explicit "Desktop has no working bypass in 2.1.x" guidance. Discoverability check passed (CLAUDE.md §6 already surfaces `docs/solutions/`). Phase 2.5 refresh skipped (no stale candidates).

**Memory-file maintenance (commit `483dbe48d`):** CLAUDE.md trimmed from 649 → 556 lines (-14%); replit.md from 172 → 158 lines (-8%). Cuts: redundant code examples now restated by their skill files (§2 violations, §3 seed violations, §10 canonical Agent/Minion/Specialist/Swarm definitions in slide-factory SKILL.md, §13 one of three TSX examples), Architecture Notes "Number taxonomy" restatement of §2 collapsed to pointer, several 3-4-line skill-pointer subsections tightened. NOT touched: inviolable login/auth rules (verbatim), §13 base rule + 2 examples (gate shipped 2026-05-17), import-discipline + Zod gotchas (short, valuable inline). All 13 numbered sections preserved; all 9 named-subsection refs from replit.md still resolve. Harmonization gate per CLAUDE.md "Memory-file harmonization" rule — both files shipped in single commit.

**CodeRabbit review (post-trim):** user invoked, loop stood down — working tree clean (everything pushed) and loop toggle OFF. No state files written. Run `/coderabbit-loop-on` then `/coderabbit-loop-review` when there are working-tree changes to review.

**Memory captured (saved to `~/.claude/projects/.../memory/`):**
- `feedback_powershell_repo_path.md` — don't assume the user is in the H-Analytics repo when issuing PowerShell commands on Windows; their clone is not in any common location.
- `feedback_windows_native_claude_install.md` — user's Windows runs Anthropic native `claude.exe` at `~/.local/bin\`, not npm; sibling `.cmd` shims won't shadow it because of PATHEXT.

## Files CC Owns Right Now

None — work is on main, working tree clean.

## What's Pending

- **T3-1 Matteo — Model Router Specialist is COMPLETE (all U1–U8 shipped).** Done-when criteria met: routing table in `admin_resources kind=llm_slot`, Mistral OCR 3 + DeepSeek + Gemini routing, cost-per-task JSONL log via `admin-llm-cost.ts`, cost visible in Admin LLM Workflows Cost tab.
- **T2-6 CC scope COMPLETE.** Brand CRUD API routes shipped. Replit UI portion: create/edit brand form under Admin → Model Defaults → Brands tab. Routes: `POST /api/admin/brands` (slug + name + metadata), `PATCH /api/admin/brands/:slug` (update display name/metadata). Brand list already at `GET /api/admin/brands`.
- **Next session priority:** T2-7 (horizontal tabs → collapsible UI on non-main pages, Replit-safe), or any other CC-specific task. T2-6 call-site sweep (ensuring all brand references use slug lookup, not hardcoded display names) is low-priority unless audit reveals violations.
- New T2 entries on plan added 2026-05-17 (Replit-safe, can run in parallel with Matteo): T2-6 (generic brand-type slugs + admin UI), T2-7 (horizontal tabs → collapsible UI on non-main pages). T2-5 (reference ranges singleton) is deferred pending ownership clarification.
- Open TODO carried from prior sessions (CLAUDE.md): Migrate remaining `DEFAULT_*` constants in `lib/shared/src/constants*.ts` to `model_defaults` DB rows (incremental — check off each as cleaned up).

## Handoff to Replit — T2-6 UI

**New API routes ready for UI work (`artifacts/api-server/src/routes/admin/fees.ts`):**
- `POST /api/admin/brands` — create brand. Body: `{ slug: string, name: string, description?: string|null, businessModel?: "hotel"|"str", segment?: string|null, sortOrder?: number, isActive?: boolean }`. Returns `201 + brand row`. 409 if slug already exists.
- `PATCH /api/admin/brands/:slug` — update brand metadata. Same fields as POST except slug is immutable. Returns updated brand row. 404 if slug not found.

**Existing routes:**
- `GET /api/admin/brands` — list all brands (already wired, already used in `BrandsTab.tsx`)

**UI task:** Add "New Brand" button + form, and "Edit" capability per brand, to the existing `BrandsTab.tsx` at `artifacts/hospitality-business-portal/src/components/admin/model-defaults/BrandsTab.tsx`. Fields: slug (create-only), display name, description, businessModel (hotel/str), segment, sortOrder, isActive toggle.

---

## Handoff to Replit

All clean on `main`. No CC-specific work outstanding.

Outstanding Replit UI tasks (still on Replit's plate, unchanged from prior handoff):
- T2-4 UI: "Verify deck" button in Slide Factory Tab 6 — `POST /api/slide-factory-runs/:id/verify` → `GET /api/slide-factory-runs/:id/verification`. Severity: ok=emerald, advisory=sky, warning=amber, block=red.
- T2-3 UI: "Improve with AI" button on `descriptionImproved` textarea in `BasicInfoSection.tsx` — `POST /api/properties/:id/rewrite-description { text: string }`.
- T2-2 UI: Portfolio selector on property list — `GET /api/portfolios`, `PUT /api/properties/:id/portfolio { portfolioId: N | null }`.

Pre-existing test failures (not introduced this session, not CC-owned):
- `check:lint` — no-shadow in `api-server/src/chat/rebecca-tool-impls-slide-factory.ts`
- `test:api-server` — marco, builder-substitution-map, pptx-substitution, dispatch, slide-6-embed-flow

## Do Not Touch

- `lib/engine/src/` — financial engine (CC-only per CLAUDE.md §9)
- `lib/calc/src/` — financial calculators (CC-only)
- `artifacts/api-server/src/finance/` — finance routes (CC-only)
- `artifacts/api-server/src/migrations/` — runtime guards (CC-only)
- `lib/db/src/schema/` — DB schema (CC-only)

### Owner-maintained CC skills — DO NOT DELETE OR MODIFY

These four skill files are maintained by the repo owner and have been
restored multiple times after CC sessions wiped them. Treat as read-only.
Do not remove, overwrite, or merge-conflict-resolve them away.

- `.agents/skills/start-here/SKILL.md`
- `.agents/skills/plugin-stack/SKILL.md`
- `.agents/skills/workflows/SKILL.md`
- `.agents/skills/run-workflow/SKILL.md`
