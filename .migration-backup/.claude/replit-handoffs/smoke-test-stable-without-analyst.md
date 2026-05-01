# Smoke Test: Core Flows Without The Analyst

End-to-end browser verification that the user can model a property and produce financial reports without any Analyst-button clicks. The user has explicitly stated their near-term priority is "use the app and issue reports" with Analyst features deferred. This packet proves that path is unblocked.

## Doctrine Freeze Gate Check (MANDATORY)

- **Governing ADR(s):** N/A — verification packet, no new doctrine
- **ADR status:** N/A
- **Last ADR edit:** N/A
- **Sessions stable:** N/A
- **Gate decision:** ✅ Cleared to execute (verification packets are exempt per `claude-replit-split.md` § Doctrine Freeze Gate, "off for: bugfixes against shipped code, gate-failure remediation")

## Context (MANDATORY)

CC's earlier triage pass (this session) read code paths and confirmed the engine, statement components, and exports have zero Analyst dependencies — so the app *should* be usable without The Analyst. Replit has the dev-server browser session and is the only one who can verify by clicking through. This packet codifies the 5 flows that matter for "issue reports" and asks Replit to walk each one without touching `<AnalystButton />`.

If any flow surfaces a blocker (page crash, save fail, statement missing data, export fail), Replit files a `BLOCKED.md` sibling naming the flow + symptom + browser-console errors. CC owns the fix; Replit verifies.

If all 5 flows pass, the packet emits one Playwright test that locks the happy path so future regressions trip CI immediately — turning today's manual smoke test into permanent compound engineering. (See `.claude/skills/superpowers:test-driven-development` philosophy: capture the discipline as a test.)

Reference: `.claude/skills/architecture/SKILL.md` for app architecture, `.claude/rules/the-analyst-persona.md` for the principle that engines compute, Specialists analyze (so engines are usable in isolation).

## Atomic-budget check (MANDATORY)

- **Sub-step count:** 6 ✅ (5 flows + 1 Playwright capture)
- **File count:** 1 ✅ (one new Playwright test file, only if all 5 flows pass)
- **Capability domains touched:** verification ✅ (single domain)

## Tasks (MANDATORY)

### S1: Property creation + activation

- **Files:** None (browser verification only)
- **Change:** From a logged-in session, create a new property via the standard flow (Properties → Add Property or equivalent CTA). Fill the minimum required fields (name, location, room count, acquisition date, operations start date). Save.
- **Affected dependency surfaces:** S1 (page-level UI), S2 (storage write)
- **Cross-check invariants:** Per `.claude/rules/portfolio-dynamics.md`, properties must be created with `userId: null` (shared workspace). Verify via DB query if you can; if not, just confirm the property appears for any other authenticated session.
- **Acceptance criteria:**
  - [ ] Save completes without error toast
  - [ ] Property appears in Portfolio page after save
  - [ ] Property detail page loads without console errors
  - [ ] No `<AnalystButton />` was clicked at any point
- **Test impact:** Will be encoded in the S6 Playwright test if all flows pass.
- **Rollback notes:** Delete the test property via the standard delete flow. No DB rollback needed.

### S2: Assumption editing + Save

- **Files:** None (browser verification only)
- **Change:** Open the test property's edit page. Change at least 3 assumption fields across different tabs (e.g., ADR on Revenue, room count on Property Setup, base management fee on Fees). Press Save. Reload the page.
- **Affected dependency surfaces:** S1 (UI), S2 (storage), S3 (financial engine recalc)
- **Cross-check invariants:** Per `.claude/rules/recalculate-on-save.md`, every save must trigger `invalidateAllFinancialQueries(queryClient)`. Verify by watching that statement values update on subsequent navigation.
- **Acceptance criteria:**
  - [ ] Save button label is "Save" (not "Update") per `ui-patterns.md`
  - [ ] Save completes without error
  - [ ] Reloaded values match what was saved
  - [ ] No `<AnalystButton />` click required to save
  - [ ] No unsaved-changes dialog blocks the user from leaving after Save
- **Test impact:** Captured in S6.
- **Rollback notes:** N/A (test property will be deleted at end).

### S3: Financial statements render (IS / CF / BS / IA)

- **Files:** None
- **Change:** Navigate to the test property's detail page. Open each of the four statement tabs in sequence: Income Statement, Cash Flow, Balance Sheet, Investment Analysis.
- **Affected dependency surfaces:** S1 (UI), S3 (engine output), S4 (chart rendering)
- **Cross-check invariants:** Per `.claude/rules/balance-sheet-identity.md`, Total Assets − (Total Liabilities + Total Equity) must be ≤ $1 on the BS tab. Per `.claude/rules/financial-engine.md`, Net Income on IS shows interest expense only (no principal).
- **Acceptance criteria:**
  - [ ] All 4 statements render with non-empty data tables
  - [ ] Each statement has at least one chart visible (per `design-standards.md` "every page graphics-rich")
  - [ ] No "—" or NaN appears in totals rows
  - [ ] Balance Sheet shows no red imbalance warning banner
  - [ ] No `<AnalystButton />` click required
  - [ ] Browser console: 0 errors during navigation between the 4 tabs
- **Test impact:** Captured in S6.
- **Rollback notes:** N/A.

### S4: Export — PDF and Excel

- **Files:** None
- **Change:** From the property detail page, open the Export menu. Trigger PDF export, then Excel export. Save both files.
- **Affected dependency surfaces:** S5 (export pipeline)
- **Cross-check invariants:** Per `.claude/rules/exports.md`, full-scope export emits all financial statements (IS / CF / BS / IA) — never just the current tab. Statement → chart interleaving must be present.
- **Acceptance criteria:**
  - [ ] PDF download completes; file opens; contains all 4 statements + interleaved charts
  - [ ] Excel download completes; file opens; one worksheet per statement
  - [ ] No "—" or NaN values in either export
  - [ ] No cover page in either export (per export rule #4)
  - [ ] No `<AnalystButton />` click required
- **Test impact:** S6 verifies trigger; manual file inspection out of scope for the test.
- **Rollback notes:** Delete downloaded files.

### S5: Cross-portfolio Dashboard sanity

- **Files:** None
- **Change:** Navigate to the Dashboard / Portfolio page. Verify the test property appears in any portfolio aggregations (KPIs, charts, lists).
- **Affected dependency surfaces:** S1 (UI), S6 (portfolio aggregator)
- **Cross-check invariants:** Per `portfolio-dynamics.md`, portfolio metrics derive from `properties.length` dynamically — adding a property must increase counts.
- **Acceptance criteria:**
  - [ ] Property appears in the Portfolio page list
  - [ ] Dashboard KPIs reflect the new property (revenue, NOI, count incremented)
  - [ ] No console errors during Dashboard render
  - [ ] No `<AnalystButton />` click required
- **Test impact:** Captured in S6.
- **Rollback notes:** Delete the test property; counts return to pre-test state.

### S6: Encode the smoke test as a Playwright spec

- **Files:**
  - `tests/e2e/smoke-stable-without-analyst.spec.ts` (new file)
- **Change:** Translate flows S1–S5 into a Playwright test that runs against the dev server. Use existing Playwright auth helpers (do NOT click any login button per the `replit.md` warning — authenticate via direct API call before navigation). The test should:
  1. Authenticate via API
  2. Create a fresh property with deterministic name (e.g., `Smoke Test ${Date.now()}`)
  3. Navigate to property edit, change 3 assumption fields, save
  4. Open all 4 statement tabs, assert non-empty totals
  5. Trigger PDF + Excel exports, assert downloads complete (don't validate file contents)
  6. Visit Dashboard, assert the test property is in the list
  7. Delete the property in `afterEach` cleanup
  8. Assert no console errors throughout
  9. Assert no `<AnalystButton />` was clicked (`page.locator('[data-testid="analyst-button"]')` should never be the click target)
- **Affected dependency surfaces:** S8 (test infrastructure)
- **Cross-check invariants:** Per `.claude/rules/testing-strategy.md`, golden scenarios get hand-calculated values; this is a behavioral smoke test, not a golden test. Use `expect(value).toBeTruthy()` patterns rather than `toEqual(<exact number>)` since the smoke test is about wiring, not arithmetic.
- **Acceptance criteria:**
  - [ ] Test file exists and runs via `npx playwright test tests/e2e/smoke-stable-without-analyst.spec.ts`
  - [ ] Test passes against the running dev server
  - [ ] `tsc --noEmit` returns 0 errors
  - [ ] `npm run lint` returns 0 errors on the new file
  - [ ] Test cleans up its test property in `afterEach`
- **Test impact:** This IS the test. Adding it to the Playwright suite locks the happy path going forward.
- **Rollback notes:** Delete the spec file.

## Verification (MANDATORY)

### Gate commands

- [ ] `npm run check` — TypeScript: 0 errors
- [ ] `npm run lint` — 0 errors / 0 warnings on `tests/e2e/smoke-stable-without-analyst.spec.ts`
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 PASS
- [ ] `npm run test:summary` — All tests PASS
- [ ] `npm run verify:summary` — UNQUALIFIED
- [ ] `npm run health` — ALL CLEAR

### Behavioral verification

- [ ] All five S1–S5 flows pass in the dev-server browser
- [ ] S6 Playwright test passes against dev server
- [ ] Browser console: 0 errors during each flow

### Surface-specific verification

- S1 (UI) + S5 (export pipeline): each export format produces a downloadable file with non-empty content
- No `<AnalystButton />` was clicked across S1–S5

## Out of scope (MANDATORY)

- **Fixing any bug found.** If S1–S5 surface a blocker, file a `BLOCKED.md` sibling. CC owns the fix; this packet does not.
- **Validating exact financial values.** This is wiring verification, not a golden test.
- **Testing Analyst flows.** Explicitly out — the whole point is "without Analyst."
- **Running on production data.** Use the test property created in S1; clean up in S6's `afterEach`.
- **Multi-property portfolios.** Single-property smoke. Multi-property regression is a separate test.
- **Mobile / tablet rendering.** Desktop browser only.

## Surfaces footer template (MANDATORY)

Every commit emitted from this packet must end with:

```
Surfaces: S1, S2, S3, S4, S5, S6, S8
Packet: .claude/replit-handoffs/smoke-test-stable-without-analyst.md
```

## Completion report (filled by Replit on exit)

- **Commits:** _
- **Sub-steps PASSED:** _
- **Sub-steps SKIPPED with reason:** _
- **Verification gates PASSED:** _
- **Verification gates SKIPPED with reason:** _
- **Out-of-scope items discovered (filed as BLOCKED or follow-up):** _
- **Session-memory entry added:** ❌
