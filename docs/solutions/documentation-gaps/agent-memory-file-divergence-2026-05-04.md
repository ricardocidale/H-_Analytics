---
title: Agent memory file drift between claude.md and replit.md
date: 2026-05-04
category: documentation-gaps
module: agent-memory-files
problem_type: documentation_gap
component: documentation
severity: medium
applies_when:
  - A repo maintains two or more agent memory files covering overlapping surfaces
  - Shared inviolable rules appear verbatim in multiple files and any one file can be edited independently
  - A Recent Changes section records implementation details that may drift from code as code evolves
  - An LLM agent uses only one of the memory files as its context source
symptoms:
  - A route or pipeline exists in the codebase but is absent from one memory file's section on that surface
  - An applies-to clause in a shared rule names a code path that has since changed its implementation
  - Two files use non-identical wording for the same shared inviolable rule
  - A Recent Changes entry describes a code pattern that does not match what the referenced file currently contains
tags:
  - agent-memory
  - claude-md
  - replit-md
  - harmonization
  - documentation-drift
  - convention
  - auth
  - documentation
---

# Agent memory file drift between claude.md and replit.md

## Context

`claude.md` and `replit.md` in the H+ Analytics monorepo serve as the behavioral contracts for every AI agent session — Claude Code reads `claude.md` as the canonical source; Replit Agent reads `replit.md`. Both files are supposed to carry identical wording for shared inviolable rules and to be kept in sync when architecture changes.

In practice, four divergences accumulated without any session noticing:

1. **Missing pipeline** — The LB Portfolio Deck pipeline (routes `POST /api/lb-slides/render`, `GET /api/lb-slides/download/combined.pdf`, DB table `lb_slides_config`) was described in `replit.md`'s intro but entirely absent from `claude.md`'s LB Slides architecture section.

2. **Stale applies-to clause** — Auth Rule 4 in both files stated the rule "applies to `Login.tsx` (Google button + dev-login success)" and implied the Google button uses `window.location` navigation. A prior refactor had replaced that approach with `window.open("/api/auth/google", "_blank")` + a `refetch()` poll — but neither file was updated when the code changed.

3. **Wording mismatch in a shared rule** — Both files described Auth Rule 4 but with different phrasing: `claude.md` said "throws a same-origin security error"; `replit.md` said "is blocked by the browser's same-origin policy." Shared inviolable rules must be verbatim-identical across files.

4. **Recent Changes entry contradicted current code** — `claude.md`'s Recent Changes stated the 2026-05-04 Google OAuth fix used `(window.top || window).location.href`. The actual code in `Login.tsx` lines 241–253 uses `window.open("/api/auth/google", "_blank")` with a polling loop. (session history) The `window.top` approach was an intermediate step tried before the `window.open` solution was adopted — it was superseded but the Recent Changes entry was never corrected.

## Guidance

**Start with a side-by-side read of both files in full.** Do not assume the file you last edited is authoritative. A casual re-read of one file in isolation will not surface any of the four drift types described here.

**For any rule with an applies-to clause, verify the claim against current source.** Read the named file at the named lines. Check that the described behavior (navigation pattern, method call, flag value) matches what is actually there. Applies-to clauses are written once when a rule is created and are rarely updated when the referenced code is refactored.

**Treat Recent Changes sections as high-suspicion territory.** These entries feel authoritative — they are stamped with a date and a concrete event — but they describe a snapshot of the code, not its current state. Any entry that names a specific code pattern should be verified against current source before being used to resolve an ambiguity.

**Diff shared inviolable rules verbatim, not semantically.** "Throws a same-origin security error" and "is blocked by the browser's same-origin policy" pass a semantic read as equivalent — both describe the same constraint. Only a character-level diff catches the split.

**Verification steps by drift type:**

| Drift type | Detection method |
|---|---|
| Missing pipeline | Compare section headings and intro descriptions — a named pipeline in one file's intro but absent as a section in the other is a structural gap |
| Stale applies-to clause | Grep the named source file for the behavior the clause describes; if empty or different, the clause is stale |
| Wording mismatch | Diff rule text character by character across both files |
| Contradicted Recent Changes | Read the source file at the named lines; compare actual implementation to entry description |

## Why This Matters

**The most dangerous drift is a Recent Changes entry that contradicts current code.** Agents treat Recent Changes as both authoritative and temporally newer than the rule text. If a rule and a Recent Changes entry conflict, an agent will trust the Recent Changes entry — it appears to reflect a deliberate decision made after the rule was written. A stale entry does not read as stale; it reads as a correction to an older rule.

In this case, `claude.md` stated that the Google OAuth fix used `(window.top || window).location.href`. Any agent reading that entry would confidently follow out-of-date guidance. The actual code uses `window.open("_blank")` to escape the `X-Frame-Options: DENY` iframe restriction — `window.location` fails entirely in that context.

**The second most dangerous drift is an applies-to clause that outlives the code it describes.** Clauses anchor rules to specific files and behaviors. When the file changes, the clause still names the file but mischaracterizes what it does. An agent learns the wrong thing about a file it trusts memory to describe accurately.

Both drift types are invisible to a re-read of a single file. They surface only when checked against source.

## When to Apply

- Before taking any action based on a rule in either `claude.md` or `replit.md` when both files overlap on that rule.
- After any refactor, rename, or behavioral change to a file or pattern referenced in an applies-to clause or a Recent Changes section — update both files in the same commit.
- Before writing a new rule that will appear in multiple memory files — agree on verbatim wording and write it identically in all files simultaneously.
- When an agent produces behavior that contradicts an expected rule — check whether a Recent Changes entry or applies-to clause conflicts with the rule text.
- Periodic hygiene pass: verify Recent Changes entries and applies-to clauses against current source.

## Examples

**Missing pipeline — structural gap**

`replit.md` intro described the LB Portfolio Deck pipeline with routes and DB table.
`claude.md`'s LB Slides section only covered `GET /api/properties/:id/deck.pdf` (per-property deck).
Fix: added "LB Portfolio Deck" subsection to `claude.md`'s LB Slides section with routes, DB table, and admin route.

---

**Stale applies-to clause**

```
Before (both files):
  Auth Rule 4 — Applies to Login.tsx (Google button + dev-login success).

After (both files):
  Auth Rule 4 — Applies to dev-login success in Login.tsx and logout in
  lib/auth.tsx (onSuccess). Google OAuth uses window.open("/api/auth/google",
  "_blank") to escape the iframe (Google pages send X-Frame-Options: DENY);
  Login.tsx polls refetch() until the session is established.
```

Detection: grepped `Login.tsx` for `window.location` near the Google button — nothing. Lines 241–253 showed `window.open("_blank")` and a polling loop. Source verification was required; neither memory file contained a signal that the clause was stale.

---

**Contradicted Recent Changes entry**

```
Before (claude.md Recent Changes):
  | 2026-05-04 | Google OAuth iframe fix. Login.tsx Google button changed from
    window.location.href to (window.top || window).location.href — ...

After:
  | 2026-05-04 | Google OAuth iframe fix. Login.tsx Google button changed to
    window.open("/api/auth/google", "_blank") + poll refetch() every 2 s —
    Google's sign-in page sends X-Frame-Options: DENY and cannot render inside
    the Replit preview iframe; opening a new tab avoids the iframe entirely.
```

(session history) The `window.top` approach was an intermediate attempt to escape the iframe before redirect. The final solution — `window.open("_blank")` — avoids the iframe entirely rather than navigating out of it. The Recent Changes entry recorded the intermediate approach, not the final one.

## Related

- `docs/solutions/tooling/mirror-shared-package-sync.md` — same two-file sync invariant failure mode; that doc covers TypeScript constants, this one covers agent memory files, but the "no solo update" prevention rule applies to both.
- `docs/solutions/integration-issues/dev-login-empty-body-edge-proxy-2026-05-02.md` — auth system context; covers edge-proxy failure mode in the same `Login.tsx`, not memory file drift.
- `docs/solutions/architecture-patterns/lb-deck-composite-payload-architecture-2026-05-04.md` — architectural record for the LB Portfolio Deck pipeline that was missing from `claude.md`.
- `.agents/skills/agent-memory-files/SKILL.md` — harmonization discipline and guidelines for maintaining agent memory files.
