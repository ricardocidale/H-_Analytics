# Packet Template

> Copy this file to `.claude/replit-handoffs/<phase>-<scope>.md` and fill every section. Sections marked **MANDATORY** are not optional — a packet missing any of them must be returned for revision before execution.

---

## Title (MANDATORY)

`Phase <N>: <Scope>` — one-line description. Match the filename.

## Doctrine Freeze Gate Check (MANDATORY)

- **Governing ADR(s):** [link]
- **ADR status:** `Accepted` / `Proposed` / `Draft`
- **Last ADR edit:** `<date / commit>`
- **Sessions stable:** `<count>` (must be ≥1 to execute)
- **Gate decision:** ✅ Cleared to execute / ⏸ Paused for doctrine stabilization

If the gate is paused, do not proceed. File a doctrine-stabilization session before opening this packet.

## Context (MANDATORY, ≤200 words)

What this packet exists to accomplish, in plain language. One paragraph. Link to:
- The governing ADR (above).
- The relevant skill file(s) under `.claude/skills/`.
- `.claude/audit-inventory.md` for the dependency surface map.
- Any prior packet this depends on (state the dependency explicitly).

## Atomic-budget check (MANDATORY)

- **Sub-step count:** `<N>` (must be ≤7)
- **File count:** `<N>` (must be ≤3)
- **Capability domains touched:** schema / storage / route / UI / verification / docs (must be ≤2 — split the packet otherwise)

If any limit is exceeded, **split the packet** into `<phase>-<scope>-a.md`, `<phase>-<scope>-b.md`, … and create a parent index file listing them in dependency order.

## Tasks (MANDATORY)

For each sub-step, all of the following are required. No exceptions.

### S1: <Short task name>

- **Files:**
  - `path/to/file.ts` (lines `<N>-<M>` if editing existing; new file otherwise)
- **Change:** Precise description — paste expected before/after diff for ≤30-line edits, or pseudocode for larger.
- **Affected dependency surfaces:** `S?, S?` (per `.claude/audit-inventory.md`)
- **Cross-check invariants:** Reference the rule pairs from `.claude/rules/cross-check-invariants.md` that this change must respect (e.g., "schema column add → also update insertSchema + IStorage interface + storage impl + zod validators").
- **Acceptance criteria** (must be objectively checkable):
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] `<specific test file>` passes.
  - [ ] `<specific behavior verifiable in dev server>` works.
  - [ ] No new lint warnings on touched files.
- **Test impact:** Which test files this should affect, and whether new tests are required (with the test file path if so).
- **Rollback notes:** If this touches DB / migrations / deployment config, exact steps to back out. Otherwise: "Revert the commit."

### S2: …

(Repeat structure. Number sequentially. Each sub-step gets its own commit.)

## Verification (MANDATORY)

Concrete commands and observable outcomes. Replit must run every step listed and report PASS/FAIL/SKIPPED with reason for each.

### Gate commands

- [ ] `npm run check` — TypeScript: 0 errors
- [ ] `npm run lint` — ESLint: 0 errors, 0 warnings on touched files
- [ ] `npm run test:summary` — All tests PASS
- [ ] `npm run verify:summary` — UNQUALIFIED PASS (all 19 phases)
- [ ] `npm run health` — ALL CLEAR
- [ ] Vocabulary test passes
- [ ] Parity check passes (if applicable to surfaces touched)

### Behavioral verification

- [ ] In dev server at `<URL>`, `<specific user action>` produces `<specific observable result>`.
- [ ] Browser console: 0 new errors during the verification flow.
- [ ] (If applicable) DB query `<SELECT …>` returns the expected row shape.

### Surface-specific verification

(Pull from `.claude/audit-inventory.md` for the surfaces touched in this packet. Each S-tag has its own canonical verification — list them here.)

## Out of scope (MANDATORY)

What this packet **does not** do, even if related. This is the discipline that keeps packets atomic. Examples:
- "Adapter for legacy `data_sources` table — deferred to packet `<phase>-<scope>-b.md`."
- "Audit-tab UI — deferred to phase 6."

If during execution Replit identifies work that belongs in scope but isn't listed, file a `BLOCKED.md` sibling rather than expanding the packet.

## Surfaces footer template (MANDATORY)

Every commit emitted from this packet must end with:

```
Surfaces: S?, S?, …
Packet: .claude/replit-handoffs/<this-filename>.md
```

If executed via the explicit-delegation lane, also include:

```
Delegated-by: Replit-Agent
DELEGATE.md: .claude/replit-handoffs/<this-filename>-DELEGATE.md
```

## Completion report (filled by Replit on exit)

After all sub-steps land, Replit appends to this packet:

- **Commits:** `<sha1>`, `<sha2>`, …
- **Sub-steps PASSED:** `<list>`
- **Sub-steps SKIPPED with reason:** `<list>`
- **Verification gates PASSED:** `<list>`
- **Verification gates SKIPPED with reason:** `<list>`
- **Out-of-scope items discovered (filed as BLOCKED or follow-up):** `<list>`
- **Session-memory entry added:** ✅ / ❌
