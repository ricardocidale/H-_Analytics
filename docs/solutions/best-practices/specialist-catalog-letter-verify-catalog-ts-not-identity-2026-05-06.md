---
title: "Verify specialist catalog tail letter in specialist-catalog.ts before assigning ADR letters — identity.ts comments can lag by one entry"
date: 2026-05-06
category: best-practices
module: specialist-catalog
problem_type: best_practice
component: documentation
severity: medium
applies_when:
  - Filing a new ADR that assigns one or more catalog letters to new specialists
  - Adding a new specialist to the Gustavo analyst roster
  - Reviewing an ADR that assigns catalog letters
  - Verifying what the next available catalog letter is before finalizing a planning document
tags:
  - specialist-catalog
  - adr
  - catalog-letters
  - identity-ts
  - naming-convention
  - letter-conflict
  - built-status
  - gustavo
---

# Verify specialist catalog tail letter in specialist-catalog.ts before assigning ADR letters — identity.ts comments can lag by one entry

## Context

ADR-010 (filed 2026-05-01, status: Proposed) assigned catalog letters Q and R to two new specialists: Quitéria (Returns Intelligence) and Rafaela (Distributions Intelligence). The ADR author derived the next available letter from the comment in `lib/engine/src/analyst/identity.ts`, which read: "letters A–P; the roster will grow to 18 once Q / Quitéria and R / Rafaela ship."

When the build phase opened, the actual catalog array (`specialist-catalog.ts`) showed a conflict: letter Q was already occupied by Quentin (`portfolio.capital-raise`, status: `built`) — a specialist added after ADR-010 was filed but before its build began. Because catalog letters are stable identifiers once a specialist reaches `built` status, Q was immovable.

**Resolution:** Quitéria → R, Rafaela → S. ADR-010 was amended. No code had been written yet, so the fix was documentation-only.

**Root cause:** `identity.ts` comments were not updated when Quentin was added to the catalog. The author relied on a secondary source that had silently drifted.

## Guidance

**1. The authoritative source for the current tail letter is `specialist-catalog.ts` — always.**

Before assigning any catalog letter in an ADR or plan, open `lib/engine/src/analyst/registry/specialist-catalog.ts` and read the last entry in the `SPECIALIST_CATALOG` array. The next available letter is the one after it.

```ts
// specialist-catalog.ts — always read this before assigning letters
export const SPECIALIST_CATALOG = [
  // ...
  { letter: "Q", id: "portfolio.capital-raise", humanName: "Quentin", status: "built" },
  // ^ Current tail. Next specialist gets R, not Q.
] as const;
```

Do not rely on `identity.ts` comments, ADR text, or any documentation that was written at a point in time.

**2. Update `identity.ts` comments in the same PR that adds a specialist to the catalog.**

The lag that caused this conflict: Quentin was added to `specialist-catalog.ts` without updating the corresponding count and letter range in `identity.ts`. These are coupled changes. The rule: whenever a specialist entry is added to `specialist-catalog.ts`, the PR must also update `identity.ts` to reflect the new tail letter and count. They must never ship in separate PRs.

```ts
// identity.ts — update this in the same PR as the specialist-catalog.ts change
// BEFORE:
// "coordinates the 16 Specialists … (letters A–P;"
// AFTER (once Quentin ships):
// "coordinates the 17 Specialists … (letters A–Q;"
```

**3. Re-verify the catalog tail immediately before starting build, not only at ADR filing time.**

The window between ADR filing (Proposed status) and build start can span days or weeks. Other specialists may ship in that window. When transitioning an ADR from Proposed to In-Progress, re-reading `specialist-catalog.ts` is step zero. If letters have shifted, amend the ADR before writing any code.

**4. Treat letter assignments in Proposed ADRs as provisional.**

A Proposed ADR has not reserved catalog letters. Letters are only locked once a specialist is built. Until then, another specialist can claim a letter in the same window.

## Why This Matters

Catalog letter conflicts caught before code is written cost one documentation amendment. Caught after code is written, the fix requires:

- Renaming specialist classes and updating registry imports in `specialist-catalog.ts`
- Patching DB seed entries that reference the letter
- Amending all ADRs, plans, and skill files that reference the letter
- Re-running migrations if any letter is stored in the database

Because `lib/engine/src/analyst/registry/specialist-catalog.ts` is on the protected financial engine surface (CLAUDE.md Section 9 — Authoring Authority), any post-build rename requires a dedicated shell CC session. The earlier a conflict is caught, the cheaper it is.

The root issue is treating a secondary source (`identity.ts` comments) as authoritative for catalog state. Secondary sources drift. The catalog array is the single source of truth because it is the artifact the runtime actually loads.

## When to Apply

- **Filing a new ADR that introduces specialists** — verify catalog tail in `specialist-catalog.ts` at filing time
- **Transitioning a Proposed ADR to In-Progress** — re-verify catalog tail; it may have changed since filing
- **Reviewing any ADR that assigns letters** — cross-check against current `specialist-catalog.ts` as a review step
- **Adding a new specialist to `specialist-catalog.ts`** — update `identity.ts` comments in the same PR (coupled change, non-negotiable)

## Examples

**Correct — verify before assigning:**
```bash
# Open specialist-catalog.ts, find the last entry
# Last entry: { letter: "Q", humanName: "Quentin", status: "built" }
# → Next available letter is R
# → Assign R to Quitéria, S to Rafaela
```

**Correct — coupled PR discipline:**
```
PR: "feat(analyst): add Quitéria (R) and Rafaela (S) specialists"
  lib/engine/src/analyst/registry/specialist-catalog.ts  ← new entries at R and S
  lib/engine/src/analyst/identity.ts                     ← comment updated: "A–S, roster 19"
  docs/architecture/decisions/ADR-010-...md             ← letters confirmed R and S
```

**Wrong — relying on identity.ts comments:**
```ts
// identity.ts comment (stale after Quentin shipped):
// "A–P active; Q/Quitéria and R/Rafaela proposed per ADR-010"
// Author reads this, assigns Q to Quitéria ← CONFLICT — Quentin already occupies Q
```

**Wrong — split PRs:**
```
PR 1: "feat(analyst): add Quentin (Q)"
  specialist-catalog.ts updated ← new entry at Q
  identity.ts NOT updated       ← drift introduced here

PR 2 (later): ADR-010 author reads identity.ts, sees "A–P active", assigns Q to Quitéria ← conflict
```

## Related

- `lib/engine/src/analyst/registry/specialist-catalog.ts` — authoritative catalog array; always consult before letter assignment
- `lib/engine/src/analyst/identity.ts` — secondary reference; must be kept in sync with catalog in every specialist-adding PR
- `docs/architecture/decisions/ADR-010-returns-and-distributions-specialists.md` — worked example of the Q→R/S shift with the immutability rule in the "Letter assignment note" section
- CLAUDE.md Section 9 — Financial Engine Authoring Authority; governs who may edit protected engine files including `specialist-catalog.ts`
- CLAUDE.md Section 10 — Agentic Member Naming Convention; governs name and role format for all new specialists
