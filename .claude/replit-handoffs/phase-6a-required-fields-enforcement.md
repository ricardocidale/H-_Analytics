# Phase 6a: Required Fields Enforcement

Make the per-Specialist `requiredFields` list (currently storage-only, set via `PUT /api/admin/specialists/:id/required-fields`) actually enforced at evaluator runtime. Today the runner accepts incomplete inputs silently because it never reads the list.

## Doctrine Freeze Gate Check

- **Governing ADR:** [`docs/architecture/decisions/ADR-006-resources-control-plane.md`](../../docs/architecture/decisions/ADR-006-resources-control-plane.md)
- **ADR status:** `Accepted` (2026-04-21)
- **Last ADR edit:** 2026-04-22 (cosmetic — pointer migration, semantic doctrine unchanged)
- **Sessions stable since acceptance:** 1 (P5 shipped clean against the v2 doctrine)
- **Gate decision:** ✅ **Cleared to execute.**

## Context (≤200 words)

P5 shipped the read/write surface for `specialist_configs.requiredFields` (architect's P5 review, `replit.md:605`, follow-up #1). Admins can author the list and it persists, but the mgmt-co router and Specialist factories never read it — so a Specialist evaluator runs even when an admin-declared required field is missing from the global-assumptions payload.

This packet closes the loop: `createMgmtCoRouter` loads each Specialist's `requiredFields` alongside its existing `{ promptTemplate, modelResourceId }` config, and the router pre-validates the inbound payload before dispatching to the evaluator. Missing required fields produce an `AnalystVerdict` with `verdict: "incomplete"` and a deterministic message naming the missing fields, NOT an evaluator crash and NOT a silent pass.

References:
- Skill: `.claude/skills/resources/SKILL.md` (invariants — Specialist-side per-row config governance)
- Skill: `.claude/skills/analyst/_index.md` (LOCKED 2026-04-21 governance block — Required Fields)
- Architect note: `replit.md:605` ("required-fields enforcement (currently storage-only, not yet read by the runner gate)")
- Prior packet: P5 (`2346de7`, `a6c78b54`) — established `getOrCreateSpecialistConfig` + router config wiring

## Atomic-budget check

- **Sub-step count:** 4 (≤7 ✅)
- **File count:** 3 (≤3 ✅)
- **Capability domains touched:** 2 — `route` (router/factory wiring) + `verification` (new contract test) ✅

## Tasks

### S1: Extend `createMgmtCoRouter` to load + pre-check `requiredFields`

- **Files:**
  - `engine/analyst/router/mgmt-co.ts` (existing — verify exact path; the file that exports `createMgmtCoRouter`. Add a pre-dispatch check.)
- **Change:**
  - Extend the `configs?: { funding?, revenue? }` option shape (added in P5) so each Specialist config object accepts `requiredFields?: string[]` alongside `promptTemplate?` and `modelResourceId?`.
  - Inside the router, before dispatching to the matching Specialist evaluator, run a deterministic pre-check: for each name in `requiredFields`, look it up in the inbound global-assumptions payload via existing path resolution. If any name resolves to `null | undefined | "" | NaN`, **short-circuit** with an `AnalystVerdict` of:
    - `verdict: "incomplete"`
    - `severity: "info"`
    - `headline: "Missing required inputs"`
    - `body: "The following fields are required by this Specialist but not set: <comma-list>. Set them in the relevant tab and re-run."`
    - `evidenceRefs: []`
    - `voiceFingerprint`: per `analyst-verdict-contract.md` rules (use the existing helper)
  - The check runs deterministically; no LLM call.
- **Affected dependency surfaces:** S-Specialist-Router, S-Analyst-Verdict (per `.claude/audit-inventory.md` — confirm exact tags during execution; if missing, file `BLOCKED.md` requesting an audit-inventory update before proceeding).
- **Cross-check invariants:**
  - "Schema column add → also update insertSchema + IStorage interface + storage impl + zod validators" — N/A (no schema change; column already exists from P5).
  - "Route signature change → also update contract test + caller(s)" — applies; covered by S3.
  - "Read-only Resource Assignments invariant" (Resources skill #3) — preserved; this packet does not touch `assignmentRefs` or any wiring graph.
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] No new lint warnings on `engine/analyst/router/mgmt-co.ts`.
  - [ ] Manual sanity: in dev, set `requiredFields = ["funding.targetEquityRaiseUsd"]` for the Funding Specialist via `PUT /api/admin/specialists/funding/required-fields`, then save a global-assumptions tab with that field blank → response includes an AnalystVerdict with `verdict: "incomplete"`.
- **Test impact:** New test added in S3.
- **Rollback notes:** Revert the commit. No DB or migration touched.

### S2: Update Specialist factory signatures to accept (but not act on) `requiredFields`

- **Files:**
  - `engine/analyst/specialists/funding.ts` (existing — `createFundingSpecialist` factory)
  - `engine/analyst/specialists/revenue.ts` (existing — `createRevenueSpecialist` factory)
- **Change:**
  - Extend each factory's `options` parameter type to include `requiredFields?: string[]` (purely additive). The factories themselves don't act on the list — the router does the gating in S1 — but accepting the option in the type keeps the call sites consistent and prevents the router from having to fork the option shape.
  - Add a `// TODO(P7): factories may consume requiredFields directly when LLM evaluators land` marker.
  - **Caller update:** the save-tab handler that constructs the router (`server/routes/global-assumptions.ts` per ADR-006 § P5 surface) is already passing `getOrCreateSpecialistConfig(specialistId)` results; that helper already returns `requiredFields` in its select shape per P5 storage. Verify the option flows through; if it doesn't, add `requiredFields: cfg.requiredFields ?? []` to the option object literal in `server/routes/global-assumptions.ts`.
- **Affected dependency surfaces:** S-Specialist-Funding, S-Specialist-Revenue, S-Save-Tab.
- **Cross-check invariants:** "Factory option shape → also update both factories symmetrically" (analyst skill rule); this packet preserves that — both Funding and Revenue change in the same commit.
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] `tests/server/admin-specialists.test.ts` continues to pass (no behavioral change introduced).
  - [ ] No new lint warnings on touched files.
- **Test impact:** No new tests in this sub-step (covered by S3); existing contract tests must continue to pass unchanged.
- **Rollback notes:** Revert the commit.

### S3: Contract test — required-fields gate produces `incomplete` verdict

- **Files:**
  - `tests/server/admin-specialists.test.ts` (existing — extend with one new `describe("required-fields gate", …)` block)
- **Change:**
  - New test cases under the existing `admin-specialists` test file:
    1. **All required fields present** → router dispatches to evaluator → returns the evaluator's verdict (existing behavior unchanged).
    2. **One required field missing** → router short-circuits → returns `verdict: "incomplete"` with the missing field name in the body, evaluator never runs (assert via spy or mock counter on the evaluator factory).
    3. **Empty `requiredFields` array** (default state) → no gate active → existing behavior unchanged.
    4. **`requiredFields` value present-but-blank-string** → counts as missing (gate fires).
  - Use the existing test-bench harness in this file; no new fixture infrastructure required.
- **Affected dependency surfaces:** S-Specialist-Router, S-Analyst-Verdict, S-Specialist-Funding (used as the evaluator under test).
- **Cross-check invariants:** "Behavior change → at least one negative test that would have failed pre-change" — this packet adds three negative tests (cases 2 + 4 directly, case 3 as regression).
- **Acceptance criteria:**
  - [ ] All 4 new test cases PASS.
  - [ ] `npm run test:summary` PASS (prior 11+ contract tests continue green).
  - [ ] `tsc --noEmit` returns 0 errors.
- **Test impact:** +4 cases in `tests/server/admin-specialists.test.ts`. No new test files.
- **Rollback notes:** Revert the commit.

### S4: Doc + session-memory updates

- **Files:**
  - `.claude/phases.md` (existing — flip Resources P6 sub-row tracking once all six P6 packets land; for this single sub-packet, add a note line: "P6a Required Fields enforcement ✅ Shipped `<sha>`")
  - `.claude/session-memory.md` (existing — append ≤5-line entry per `documentation.md` rule)
  - `replit.md` (existing — append a Recent Changes bullet under the existing 2026-04-22 block: "P6a — Required Fields enforcement landed. Specialist-declared required fields now gate the evaluator at the router; missing fields return `incomplete` verdict instead of silent pass. Closes architect P5-medium #1.")
- **Change:** Doc-only.
- **Affected dependency surfaces:** None (docs).
- **Cross-check invariants:** "No new live phase|status table outside `.claude/phases.md`" (per `documentation.md` § Phase status changes). Verified via S5 gate command below.
- **Acceptance criteria:**
  - [ ] `tsx script/check-phase-status-uniqueness.ts` PASS.
  - [ ] No regression in any prior gate.
- **Test impact:** None.
- **Rollback notes:** Revert the commit.

## Verification

### Gate commands

- [ ] `npm run check` — TypeScript: 0 errors
- [ ] `npm run lint:summary` — PASS 0 errors
- [ ] `npm run test:summary` — PASS (including 4 new cases from S3)
- [ ] `npm run verify:summary` — UNQUALIFIED PASS (all 19 phases, 508+ checks)
- [ ] `npm run health` — ALL CLEAR
- [ ] `npm run parity:check` — PASS (parity surfaces unchanged)
- [ ] `tsx script/check-phase-status-uniqueness.ts` — PASS

### Behavioral verification

- [ ] In dev server, log in as admin → navigate to a Specialist sub-page → set `requiredFields = ["funding.targetEquityRaiseUsd"]` for the Funding Specialist via the Required Fields tab.
- [ ] Open a global-assumptions tab containing the Funding section, leave `targetEquityRaiseUsd` blank, click Save.
- [ ] Server response includes `analystVerdict.verdict === "incomplete"` and the message names `funding.targetEquityRaiseUsd`.
- [ ] Set the field to a valid number, save again → verdict changes back to whatever the evaluator returns (likely a deterministic `verdict: "ok"` per the existing stub).
- [ ] Browser console: 0 new errors during the flow.

### Surface-specific verification

- [ ] Vocabulary test passes (no internal-team terms leak into the verdict body — "incomplete" / "Missing required inputs" are user-facing-safe).
- [ ] `tests/server/admin-specialists.test.ts` 11+4 = 15+ cases all green.

## Out of scope

- Wiring `requiredFields` into other Specialists (Compensation, Overhead, Company, Property-Defaults). Funding + Revenue only this packet — they're the only Specialists with shipped surfaces (P5).
- UI affordance for "test this required-fields list" (defer to P7 Specialists C–G work).
- Internationalization of the "Missing required inputs" string (project is single-locale today).
- Required-fields support for non-mgmt-co Specialists (Property, Photos, Portfolio Ops) — those have no Surface Specialist yet (Phase 4 work).
- LLM evaluator integration (P7).
- Adapter packets (P6e, P6f) — separate sub-packets.

## Surfaces footer template

Every commit emitted from this packet must end with:

```
Surfaces: S-Specialist-Router, S-Specialist-Funding, S-Specialist-Revenue, S-Analyst-Verdict, S-Save-Tab
Packet: .claude/replit-handoffs/phase-6a-required-fields-enforcement.md
```

(Pull exact S-tags from `.claude/audit-inventory.md` during execution; if any tag listed here is missing from the inventory, file a `BLOCKED.md` requesting an audit-inventory update before continuing.)

## Completion report (filled by Replit on exit)

- **Commits:** `<sha1>`, `<sha2>`, `<sha3>`, `<sha4>`
- **Sub-steps PASSED:**
- **Sub-steps SKIPPED with reason:**
- **Verification gates PASSED:**
- **Verification gates SKIPPED with reason:**
- **Out-of-scope items discovered (filed as BLOCKED or follow-up):**
- **Session-memory entry added:** ☐
