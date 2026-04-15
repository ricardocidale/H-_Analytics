# Master Remediation & Optimization Plan

**Created:** April 14, 2026
**Goal:** Fix every known bug, tighten every domain boundary, and add automated guards so bugs can't recur.

---

## Architecture: 13 Domains

| Domain | Files | Key Bug Count | Owner |
|---|---|---|---|
| Financial Engine (engine/, calc/, shared/constants) | 117 src + 64 tests | 11 critical calc bugs | Claude |
| AI & Research (server/ai/, research routes) | 72 src + 13 tests | 1 (no cache on grounded research) | Claude |
| External Services (server/services/, integrations/) | 26 src | 7 (timeouts, 429 handling, fake data) | Claude |
| Rebecca Chatbot (chat route, rebecca components) | 13 src | 4 client-side (XSS, stale closure, race) | Replit |
| Photos & Images (property-photos, uploads, image/) | 14 src + 1 test | 0 | — |
| Scenarios (scenarios routes, financial-sharing) | 8 src + 6 tests | 1 (localStorage bypass) | Replit |
| Users & Auth (auth, users storage) | 4 src + 2 tests | 1 (partner role mismatch) | Claude |
| Properties (properties routes, storage) | 4 src + 1 test | 0 | — |
| Documents (documents route, document-ai/) | 4 src | 2 (timeout, fake fallback) | Claude |
| Exports (premium-exports, report/, generators) | 9 src + 1 test | 1 (entitlement bypass) | Replit |
| Admin (admin routes, admin components) | 118 src + 2 tests | 2 (sync tests) | Replit |
| Notifications (notifications route, engine, events) | 4 src | 0 | — |
| Infrastructure (db, logger, middleware, providers) | 15 src + 3 tests | 0 | — |

---

## Task 1: Financial Engine — Fix All Wrong Numbers
**Owner:** Claude | **Priority:** CRITICAL | **Est:** 1 hour

These produce incorrect values shown to investors. Each fix gets a test.

| # | Bug | File | Fix |
|---|---|---|---|
| 1.1 | Negative exit valuation when NOI < 0 | cashFlowAggregator.ts, yearlyAggregator.ts | Floor annualizedNOI at 0 before dividing by cap rate |
| 1.2 | FF&E double-counted in cash flow | cashFlowSections.ts | Remove duplicate FF&E deduction from FCF calculation |
| 1.3 | Negative depreciated basis in hold-vs-sell | hold-vs-sell.ts | `Math.max(0, costBasis - holdYearsDepreciation)` |
| 1.4 | Cost seg percentages sum > 100% | resolve-assumptions.ts | Clamp proportionally when sum exceeds 1.0 |
| 1.5 | depreciationYears = 0 → zero depreciation | resolve-assumptions.ts | Default to DEPRECIATION_YEARS constant when 0 |
| 1.6 | Refinance before acquisition accepted | refinance-pass.ts | Reject when refiMonthIndex < acqMonthIdx |
| 1.7 | NOL resets at refiMonthIndex === 0 | refinance-pass.ts | Use financials[0].nolBalance instead of 0 |
| 1.8 | Partner comp indexed to model year not ops year | company-engine.ts | Compute opsYear from ops start, not model start |
| 1.9 | NOL summed across SPVs in consolidation | consolidation.ts | Remove from portfolio sum or flag as display-only |
| 1.10 | Pre-ops months counted as operational for annualization | cashFlowAggregator.ts | Use `revenueTotal > 0` only |
| 1.11 | Zero hold period adds extra year of NOI growth | hold-vs-sell.ts | Use current_noi directly when hold years = 0 |

**Extract after fixing:** `calc/shared/pmt.ts` — one canonical PMT function replaces 5 copies in stress-scenarios, portfolio-risk-scorer, executive-summary, risk-intelligence (2x). Add audit test: no other file may contain `Math.pow(1 + rate`.

**Verify:** Run full engine test suite (2,123 tests) + golden scenarios. Must be UNQUALIFIED.

---

## Task 2: External Services — Timeouts, Retry, Safety
**Owner:** Claude | **Priority:** HIGH | **Est:** 45 min

| # | Bug | File | Fix |
|---|---|---|---|
| 2.1 | 429 trips circuit breaker instead of retrying | integrations/base.ts | `isTransientError` returns true for 429 |
| 2.2 | No timeout on 4 Google Maps fetches | integrations/geospatial.ts | `signal: AbortSignal.timeout(10000)` |
| 2.3 | No timeout on Document AI fetch | integrations/document-ai.ts | `signal: AbortSignal.timeout(30000)` |
| 2.4 | No timeout on 4 Replicate fetches | integrations/replicate.ts | `signal: AbortSignal.timeout(15000)` |
| 2.5 | Fake data returned on Document AI failure | integrations/document-ai.ts | Return empty result with `simulated: true` flag |
| 2.6 | Apify token in URL query string | services/ApifyService.ts | Move to Authorization header |
| 2.7 | GroundedResearch has no cache | services/GroundedResearchService.ts | Add 4h TTL cache |

**Extract after fixing:** `server/lib/fetch-with-timeout.ts` — one wrapper used by all integrations. Add audit test: no raw `fetch(` in server/integrations/ without `signal:`.

---

## Task 3: Schema & Constants — Alignment
**Owner:** Claude | **Priority:** MEDIUM | **Est:** 30 min

| # | Bug | File | Fix |
|---|---|---|---|
| 3.1 | "partner" role in constants, missing from Zod | constants-enums.ts, schema/auth.ts | Remove from constants (not a real role) |
| 3.2 | 6 countries wrong CRP values | countryDefaults.ts | Sync from countryRiskPremiums.ts (authoritative) |
| 3.3 | 10 notNull columns without defaults | schema/config.ts | Add `.default()` referencing constants |
| 3.4 | Refi LTV triple-split | constants.ts, constants-funding.ts, field-registry.ts | Delete DEFAULT_REFI_LTV, use DEFAULT_LTV |
| 3.5 | fiscalYearStartMonth accepts 13+ | schema/config.ts | Add check constraint 1-12 |

---

## Task 4: Shared Utilities — Eliminate Duplication
**Owner:** Claude | **Priority:** HIGH | **Est:** 45 min

| Utility | What It Replaces | Files Affected |
|---|---|---|
| `calc/shared/pmt.ts` | 5 copies of PMT formula | stress-scenarios, portfolio-risk-scorer, executive-summary, risk-intelligence (2x) |
| `server/lib/fetch-with-timeout.ts` | Raw fetch in all integrations | geospatial, document-ai, replicate, + future services |
| `server/lib/sanitize-error.ts` | Ad-hoc error sanitization | source-health-checker (move from), all catch blocks that send to client |
| `server/routes/helpers.ts` (already exists) | parseRouteId already there | Enforce via audit test |

---

## Task 5: Automated Guards — Tests That Prevent Recurrence
**Owner:** Claude | **Priority:** HIGH | **Est:** 45 min

New files in `tests/audit/`:

| Test File | What It Catches | Pattern |
|---|---|---|
| `no-raw-number-params.test.ts` | `Number(req.params` in route files | Static grep — must use parseRouteId |
| `no-unguarded-division.test.ts` | Division without epsilon/zero guard in engine/ | Grep for `/ ` in engine files, verify guard within 5 lines |
| `no-fetch-without-timeout.test.ts` | Raw `fetch(` in server/integrations/ without `signal:` | Static grep |
| `pmt-canonical.test.ts` | PMT logic outside calc/shared/pmt.ts | Grep for `Math.pow(1 + rate` — only allowed in pmt.ts |
| `no-raw-error-to-client.test.ts` | `error.message` in `res.json()` calls | Static grep — must use sanitized message |
| `vocabulary-compliance.test.ts` | Forbidden terms in client/src/ | Grep for "Regenerate Intelligence", "Stale", "No Intelligence", "Generate Research" |
| `no-catch-any.test.ts` | `catch(error: any)` in server/ | Already passing — keep it |

---

## Task 6: Skills & Documentation Tightening
**Owner:** Claude | **Priority:** MEDIUM | **Est:** 30 min

| What | Action |
|---|---|
| `vocabulary/SKILL.md` | Already created. Add Section 12: Domain Boundary Rules. |
| `finance/SKILL.md` | Add: "Only `calc/shared/pmt.ts` may compute PMT. No other file." |
| `architecture/SKILL.md` | Add: Domain coupling map. Which domains may import which. |
| `integrations/SKILL.md` | Add: "All external fetches must use `fetchWithTimeout`. No raw `fetch()`." |
| `coding-conventions/SKILL.md` | Add: "All route params must use `parseRouteId`. All error messages to clients must use `sanitizeError`." |
| `claude.md` | Update skill count, add domain map reference, add "run `npm run audit:quick` before pushing" |
| `replit.md` | Same updates for Replit parity |
| `session-memory.md` | Log this plan execution |

---

## Task 7: Replit Brief — Client-Side Fixes
**Owner:** Replit | **Priority:** MEDIUM | **Est:** 45 min

Hand these to Replit after Tasks 1-6 are pushed:

| # | Bug | File | Fix |
|---|---|---|---|
| 7.1 | `javascript:` URIs in Rebecca markdown | RebeccaMarkdown.tsx | Whitelist http/https only |
| 7.2 | `export-premium` localStorage bypass | ExportDialog.tsx | Server-side entitlement check |
| 7.3 | ErrorBoundary shows raw Error.message | ErrorBoundary.tsx | Generic message: "Something went wrong" |
| 7.4 | RebeccaPanel stale closure | RebeccaPanel.tsx | Add missing useEffect deps |
| 7.5 | poi.rating unescaped in map popup | PropertyMap.tsx | `escapeHtml(poi.rating)` |
| 7.6 | sendMessage race condition | RebeccaPanel.tsx | Early `setLoading(true)` |
| 7.7 | Research pages missing ErrorBoundary | App.tsx | Wrap in FinancialErrorBoundary |
| 7.8 | NaN in chart tooltip | OverviewPerformanceSection.tsx | isNaN guard |
| 7.9 | toLocaleString without locale | Multiple chart files | `new Intl.NumberFormat("en-US")` |
| 7.10 | Admin sidebar restructuring | AdminSidebar.tsx, Admin.tsx, ModelDefaultsTab.tsx | Per the brief already written (ManCo: Services & Fees + Statement Lines; Properties: Defaults + Required Fields) |
| 7.11 | Vocabulary compliance in any new UI text | All new components | Read vocabulary/SKILL.md before writing text |

---

## Execution Order

| Step | Task | Depends On | Time |
|---|---|---|---|
| 1 | Task 1: Engine fixes (11 bugs) | — | 60 min |
| 2 | Task 1 verify: Run 2,123 engine tests | Step 1 | 5 min |
| 3 | Task 4: Extract shared PMT | Step 1 | 15 min |
| 4 | Task 2: External services (7 bugs) | — | 45 min |
| 5 | Task 4: Extract fetchWithTimeout + sanitizeError | Step 4 | 15 min |
| 6 | Task 3: Schema/constants (5 bugs) | — | 30 min |
| 7 | Task 5: Write 7 audit tests | Steps 3, 5 | 45 min |
| 8 | Task 6: Update all skills/docs | Steps 1-7 | 30 min |
| 9 | Full test suite + CI push | Steps 1-8 | 10 min |
| 10 | Task 7: Hand Replit brief | Step 9 pushed | 5 min |

**Total Claude:** ~4 hours
**Total Replit:** ~45 min (after Claude pushes)

---

## Verification Checklist

After all tasks complete:

- [ ] `npm run test:summary` — zero failures
- [ ] `npm run verify:summary` — UNQUALIFIED on all golden scenarios
- [ ] `npm run audit:quick` — zero violations
- [ ] CI green on push
- [ ] No `Number(req.params` outside parseRouteId (audit test)
- [ ] No `catch(error: any)` in server/ (audit test)
- [ ] No raw `fetch(` without timeout in integrations/ (audit test)
- [ ] No duplicate PMT formula (audit test)
- [ ] No forbidden vocabulary terms in client/src/ (audit test)
- [ ] One canonical PMT function in `calc/shared/pmt.ts`
- [ ] One canonical `fetchWithTimeout` in `server/lib/`
- [ ] One canonical `sanitizeError` in `server/lib/`
- [ ] All 429 responses retried (not circuit-broken)
- [ ] All external fetches have timeouts
- [ ] All CRP values match Damodaran source
- [ ] All notNull columns have DB defaults
- [ ] Skills updated with domain boundary rules
- [ ] claude.md and replit.md updated
- [ ] session-memory.md logged

---

## Prevention: Why Bugs Won't Come Back

After this plan:
- **Duplicated code** → extracted into shared utilities with audit tests blocking new copies
- **Missing guards** → audit tests fail on commit if guard is absent
- **Wrong vocabulary** → audit test fails if forbidden terms appear
- **Raw fetch without timeout** → audit test blocks it
- **New route without parseRouteId** → audit test blocks it
- **Error messages leaking** → audit test blocks raw `error.message` in responses

The tests are the immune system. They run on every commit (pre-commit hooks) and every push (CI). No human or AI needs to remember the rules.
