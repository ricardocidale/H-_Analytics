---
title: "refactor: CLAUDE.md Optimization and replit.md Harmonization"
type: refactor
status: completed
date: 2026-05-09
---

# refactor: CLAUDE.md Optimization and replit.md Harmonization

## Summary

CLAUDE.md has grown to 670 lines, accumulating detailed how-to runbooks and reference tables that the agent-memory-files skill identifies as anti-patterns. This plan trims those to rule + link form, formalizes the pointer model (replit.md defers to CLAUDE.md rather than mirroring it), fixes the preamble claim that incorrectly promises "verbatim-identical" shared sections, and repairs the small but real drifts that have accumulated between the two files.

---

## Problem Frame

The always-loaded CLAUDE.md is too long. It contains several full migration runbooks, a 20-item reserved-names inventory, and multi-paragraph descriptions of features that already have dedicated skill files. This reduces signal-to-noise for every agent session. Separately, replit.md has drifted: its Recent Significant Changes table lists entries not in CLAUDE.md (Inflation policy) and is missing an entry that IS in CLAUDE.md (Schema change workflow). The `lb-slides-renderer` skill is listed in replit.md's Pointers table but absent from CLAUDE.md's key skills table. These small drifts compound over time.

---

## Requirements

- R1. CLAUDE.md length is reduced without losing any inviolable rule, contract, or routing signal.
- R2. Trimmed how-to content is replaced with a one-line rule + a link to the authoritative skill or doc that already holds the detail.
- R3. The "verbatim-identical" claim in the CLAUDE.md preamble is corrected to reflect the pointer model actually in use.
- R4. Recent Significant Changes tables in both files agree (same entries or each file carries only its own unique context).
- R5. The `lb-slides-renderer` skill appears in CLAUDE.md's "Key project-specific skills" table.
- R6. No inviolable rule, numbered gate (§§1–12), auth rule, or routing pointer is removed or degraded.

---

## Scope Boundaries

- This plan does not rewrite skill files (SKILL.md), only the CLAUDE.md / replit.md memory files.
- This plan does not change any application code.
- Architecture content that belongs in CLAUDE.md (number taxonomy, inflation policy, ADR-007, DI discipline) stays — only how-to runbooks and reference inventories are trimmed.
- replit.md stays in pointer / lean form — it does not grow to mirror CLAUDE.md sections.

---

## Context & Research

### Relevant Code and Patterns

- `CLAUDE.md` — canonical agent memory file (670 lines)
- `replit.md` — pointer file, 84 lines
- `.agents/skills/agent-memory-files/SKILL.md` — discipline for memory file maintenance
- `.local/skills/pnpm-workspace/references/db.md` — already holds the schema-change runbook that §Migration system architecture duplicates
- `.agents/skills/slide-factory/SKILL.md` — already holds the naming convention and reserved-names inventory
- `.agents/skills/costantino-data-custodian/SKILL.md` — already holds Costantino detail
- `.agents/skills/lb-slides-renderer/SKILL.md` — exists, listed in replit.md but not CLAUDE.md

### Institutional Learnings

- agent-memory-files skill: "Deep how-to content inline — the file becomes too long to load efficiently. Move it to a skill and link."
- agent-memory-files skill: "Per quarter: full audit — re-read every line, prune stale routing, collapse duplicate rules, verify counts."
- CLAUDE.md §11 is the mandatory shipping gate: harmonize replit.md whenever CLAUDE.md is touched.

---

## Key Technical Decisions

- **Pointer model formalized:** replit.md carries Replit-specific extras + routing table. CLAUDE.md is the canonical source. CLAUDE.md preamble is updated to say "pointer model" not "verbatim-identical". The agent-memory-files skill's mirror option is explicitly not adopted.
- **Rule + link, not deletion:** Every trimmed section leaves a one-sentence summary of the rule and a link to where the full content lives. Nothing is removed without a visible routing path.
- **Recent Changes table policy:** Each file's Recent Changes table carries the union of significant changes from the last ~6 weeks. The Inflation policy entry belongs in CLAUDE.md (it's a core architecture rule). The Schema change workflow entry belongs in replit.md (it's a workflow all agents need). Both entries should appear in both tables going forward.

---

## Open Questions

### Resolved During Planning

- **Mirror vs pointer?** → Pointer (user confirmed). replit.md stays lean.
- **Is `lb-slides-renderer` in CLAUDE.md?** → No, it is in replit.md Pointers table only. Needs to be added to CLAUDE.md §"Key project-specific skills".
- **Inflation policy in CLAUDE.md?** → The section exists in CLAUDE.md Architecture Notes, but it is missing from CLAUDE.md's Recent Significant Changes table (appears in replit.md's Recent Changes but not CLAUDE.md's). Add it.

### Deferred to Implementation

- Whether additional Architecture Notes subsections beyond the four identified below warrant further compression (executor should judge each against the rule: "inviolable rule/routing = keep; how-to runbook/inventory = trim to rule + link").

---

## Implementation Units

- U1. **Correct the mirror-vs-pointer contradiction**

**Goal:** Fix the CLAUDE.md preamble that incorrectly promises "verbatim-identical" shared sections and formally documents the pointer model both files use.

**Requirements:** R3, R6

**Dependencies:** None

**Files:**
- Modify: `CLAUDE.md` (preamble paragraph, first blockquote)
- Modify: `replit.md` (preamble to match, if it also claims verbatim-identical)

**Approach:**
- In `CLAUDE.md`: Replace the "Shared sections (architecture, rules, vocabulary, skill table) must stay verbatim-identical between the two files" line with: "replit.md uses the pointer model — it holds Replit-specific extras and routes to this file for all shared content. When touching either file, run a harmonization pass on the other before shipping."
- In `replit.md`: The preamble already says "Canonical deep source: CLAUDE.md" — this is correct. Only update if there is any "verbatim-identical" claim present.

**Patterns to follow:**
- `.agents/skills/agent-memory-files/SKILL.md` §"Designate one canonical source"

**Test scenarios:**
- Test expectation: none — pure documentation edit, no behavioral change

**Verification:**
- Both preambles consistently describe the pointer relationship. No remaining claims about verbatim-identical sections.

---

- U2. **Trim CLAUDE.md how-to sections to rule + link**

**Goal:** Reduce CLAUDE.md from ~670 lines by compressing four sections that contain detailed runbook or reference-inventory content already held in skill files or docs.

**Requirements:** R1, R2, R6

**Dependencies:** U1

**Files:**
- Modify: `CLAUDE.md`

**Approach:**

Four target sections, each trimmed to: one-sentence rule + link to authoritative source:

1. **§Migration system architecture — "Schema change workflow" runbook** (the 6-step numbered workflow with bash one-liners): Compress to: "Always use `pnpm --filter @workspace/db run generate` to produce migrations. Full runbook: `.local/skills/pnpm-workspace/references/db.md`." Keep the Two-layer system table (short, high-signal). Keep the "Querying the real DB in dev" gotcha (no dedicated skill links to it). The full step-by-step with bash scripts is duplicated from db.md.

2. **§10 Agentic Member Naming Convention — reserved-names list**: The 30+ reserved names paragraph is an ever-growing inventory. Compress to: "Full reserved-names list: `.agents/skills/slide-factory/SKILL.md`." Keep the three role definitions (orchestrator / agent / minion), the name-format rules, and the three field requirements — these are rules, not inventory.

3. **§Architecture Notes — Costantino description**: Already links to `costantino-data-custodian` skill. Compress the paragraph to the key rule (periodic health audit, self-rescheduling setTimeout, runs alongside legacy health checker) and the skill link. Drop the 8-tool loop enumeration and cadence details.

4. **§Architecture Notes — `reference_brands` AI pipeline wiring**: Already has a dedicated doc link (`docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`). Compress the three-surface bullet list to a one-sentence pointer.

**Do NOT trim:**
- §§1–12 numbered gates
- Inviolable login/auth rules
- Number taxonomy summary
- Inflation policy subsection
- Any section that does not already have a dedicated skill or doc

**Patterns to follow:**
- `.agents/skills/agent-memory-files/SKILL.md` §"What belongs in an agent memory file" (routing over content)

**Test scenarios:**
- Test expectation: none — documentation edit. Verify no routing links are dead after trimming (each skill/doc referenced must exist at the stated path).

**Verification:**
- Each of the four sections is under ~5 lines (rule + link) after editing.
- `wc -l CLAUDE.md` should drop meaningfully (target: under 550 lines).
- Every routing link in the trimmed sections resolves to an existing file. Verify with: `grep -o '`[^`]*\.md`' CLAUDE.md | tr -d '\`' | xargs -I{} test -f {} || echo "MISSING: {}"` (or equivalent targeted check for each new link added).

---

- U3. **Harmonize small drifts between CLAUDE.md and replit.md**

**Goal:** Repair the three concrete drifts found during planning so both files agree on routing and recent changes.

**Requirements:** R4, R5, R6

**Dependencies:** U2 (do this after U2 so any new routing changes from U2 are captured here)

**Files:**
- Modify: `CLAUDE.md` (§"Key project-specific skills" table, §"Recent Significant Changes")
- Modify: `replit.md` (§"Recent Significant Changes")

**Approach:**

1. **Add `lb-slides-renderer` to CLAUDE.md skill table** — In the "Key project-specific skills" table under §"Agent & Skill System", add a row for `lb-slides-renderer` with description "Slide renderer contract — Playwright HTML→PDF rendering requirements, layout constraints, and testing conventions". It already appears in replit.md's Pointers table at line 61.

2. **Harmonize Recent Significant Changes tables**:
   - **Add Inflation policy to CLAUDE.md**: The Inflation policy USD-base calculations change (2026-05-09) appears in replit.md's Recent Changes but not in CLAUDE.md's. Add it to CLAUDE.md.
   - **Add Schema change workflow to replit.md**: The "Schema change workflow documented (Task #1201)" entry (2026-05-09) appears in CLAUDE.md's Recent Changes but not in replit.md's. Add it to replit.md.
   - replit.md has a `<!-- keep ≤ 3 entries -->` comment — respect it. Pick the 3 most impactful entries for replit.md. CLAUDE.md has no such limit and can carry all 4. The two tables do not need identical counts; they need to agree on the entries that are architecturally significant for both agents.

3. **Carry forward U2 routing links to replit.md Pointers table**: U2 trims four sections and adds new skill/doc links in each. For each new link added in U2, check whether replit.md's Pointers table already covers that skill. If not, add a row. The four U2 links are: db.md runbook, `slide-factory` skill, `costantino-data-custodian` skill, `reference-brands-ai-pipeline-wiring` doc — verify each has a Pointers row or is intentionally CC-only.

**Patterns to follow:**
- `.agents/skills/agent-memory-files/SKILL.md` §"A harmonize pass per session"

**Test scenarios:**
- Test expectation: none — documentation edit

**Verification:**
- `grep "lb-slides-renderer" CLAUDE.md` returns at least one match in the skills table.
- Recent Changes tables in both files contain the same set of entries (or each file's unique context is clearly intentional).
- No routing pointer in CLAUDE.md refers to a skill that is not also reachable from replit.md's Pointers table (for skills that both agents need).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Trimming a section that another part of CLAUDE.md cross-references | Before deleting any paragraph, grep CLAUDE.md for references to the content being removed. Ensure the replacement link covers all referencing contexts. |
| `lb-slides-renderer` skill row description doesn't match what the skill actually does | Read `.agents/skills/lb-slides-renderer/SKILL.md` header before writing the table row. |
| Recent Changes table grows beyond 3 entries in replit.md | replit.md has a `<!-- keep ≤ 3 entries -->` comment — respect it. CLAUDE.md does not have this limit; keep up to 6. |

---

## Sources & References

- Agent memory files discipline: `.agents/skills/agent-memory-files/SKILL.md`
- Schema change runbook (the authoritative version): `.local/skills/pnpm-workspace/references/db.md`
- Slide factory naming/reserved names: `.agents/skills/slide-factory/SKILL.md`
- Costantino skill: `.agents/skills/costantino-data-custodian/SKILL.md`
- lb-slides-renderer skill: `.agents/skills/lb-slides-renderer/SKILL.md`
- Reference brands wiring doc: `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`
