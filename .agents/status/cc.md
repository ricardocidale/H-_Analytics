# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-17T21:45:00Z
Status: idle

## Active Branch

`main` at `a94186d24`, synced with `origin/main`.

## Last Commit on Branch

`a94186d24` — `chore(status): replit — CC refresh note bumped to 41fa4d9ea (user-authorized)`.

## What CC Did This Session (2026-05-17 session 14)

**Shipped cross-platform Claude Code permission-bypass installers — PR #161 squash-merged to main as `4f29261c4`.**

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

- Open TODO carried from prior sessions (CLAUDE.md):
  - Migrate remaining `DEFAULT_*` constants in `lib/shared/src/constants*.ts` to `model_defaults` DB rows (incremental — check off each as cleaned up)

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
