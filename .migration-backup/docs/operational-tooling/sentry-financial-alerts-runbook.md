# Sentry Financial Alerts — Runbook

**Type:** Runbook (operational reference) for post-Sentry-handoff wiring.
**Status:** Draft. Execute alert-rule configuration WITH the Sentry handoff at `docs/operational-tooling/HANDOFF-replit-sentry-financial-contexts.md` — or in the commit immediately following, if the handoff doesn't bundle UI config.
**Authority:** `docs/operational-tooling/HANDOFF-replit-sentry-financial-contexts.md` addendum §"Pending Sentry decision" committed to drafting this. Loop closed.
**Audience:** Replit Agent executing the Sentry wiring; on-call rotation (future) responding to the alerts.

---

## Why this runbook

Four `FinancialSentryError` subclasses flow through the existing `beforeSend` hook tagged with `financial: "true"` and `financial_error_class: <className>`. Without explicit alert rules, all four surface as undifferentiated 100%-captured events in the Sentry UI — no paging, no prioritization, no digest. The app has ~8 users today; a silent balance-sheet imbalance on a live property could sit in the event stream for days before someone notices.

The runbook defines **four alert tiers** that distinguish investor-defensibility-critical events (immediate page) from cost-observability signals (weekly digest).

Post-OT-A.3/OT-A.4, three additional `FinancialSentryError` subclasses joined the hierarchy (`FieldDefinitionHintViolationError`, `EngineVersionDriftError`, `ContractMigrationParityMisuseError`). The runbook covers those too.

---

## Tier 1 — Immediate page

Events in this tier represent *correctness failures that ship wrong numbers to investor-facing output*. Page within 5 minutes, regardless of time of day.

### 1.1 — `BalanceSheetImbalanceError`

**Pattern:** `tags.financial_error_class:"BalanceSheetImbalanceError"`
**Threshold:** Any single event.
**Channel:** PagerDuty (future) / email to on-call + Slack #alerts-finance.
**Payload:** includes `scope`, `propertyId?`, `month?`, `year?`, `totalAssets`, `totalLiabilitiesAndEquity`, `delta`.

**Why this tier:** balance sheet imbalance is a stop-the-line financial integrity failure. Every downstream statement (cash flow, investment analysis, exports) inherits the error. Cannot wait for weekly review.

**Response checklist:**
1. Identify which property + month the imbalance occurred on (from payload).
2. Pull the property's research-values + scenario state; reproduce the imbalance locally.
3. Check for recent engine edits (`git log --oneline -- engine/property/property-engine.ts` last 7 days).
4. If reproducible: file BLOCKED + regression commit.
5. If not reproducible: check for NaN/Infinity in upstream inputs; may be a data-integrity issue (not engine bug).

### 1.2 — `VerdictInvariantError` at ≥3/hour frequency

**Pattern:** `tags.financial_error_class:"VerdictInvariantError"` + count ≥ 3 in rolling 60-minute window.
**Threshold:** Rate-based (NOT any single event).
**Channel:** Slack #alerts-analyst + email digest.

**Why this tier:** a single `VerdictInvariantError` is usually a Specialist bug on a narrow case. But ≥3/hour means either (a) an upstream contract drift cascaded into multiple Specialists, or (b) the verdict pipeline itself is broken. Either is urgent.

**Response checklist:**
1. Group events by `specialistId`. If one Specialist dominates → specialist-local bug.
2. If multiple Specialists → check `engine/analyst/contracts/verdict.ts` for recent edits, or `engine/analyst/router/surface-router.ts`.
3. Check `server/ai/engine-version.ts` — has `ENGINE_VERSION` bumped recently? If yes, the verdict shape may have drifted without all Specialists updated.
4. If one error class flags a shape violation (`zodIssues`), fix the Specialist that emits the violating verdict.

### 1.3 — `EngineVersionDriftError` (post-Phase-5A)

**Pattern:** `tags.financial_error_class:"EngineVersionDriftError"`
**Threshold:** Any single event — but ONLY after ADR-004 Phase 5A migrations ship (when the verdict cache goes live).
**Channel:** PagerDuty (future) / email to on-call + Slack #alerts-analyst.

**Why this tier:** pre-Phase-5A, engine-version drift is a build-time violation caught by `tests/proof/engine-version-drift.test.ts`. It shouldn't reach runtime. If it does reach runtime post-Phase-5A, the cache may be serving stale reasoning (the cache-key includes `engineVersion`; drift means the key is now wrong). Every property seen since the drift may have cached bad output.

**Response checklist:**
1. Confirm the actual `SYNTHESIS_FINGERPRINT` vs declared matches — run `cat server/ai/synthesis-schema.ts server/ai/research-prompt-builders.ts | sha256sum`.
2. If they differ: the prompt files changed without the version being bumped. Identify the commit (`git log -p server/ai/synthesis-schema.ts`) and retroactively bump `ENGINE_VERSION`.
3. Purge cached `research_runs` rows with the outdated `cache_key` (SQL: `UPDATE research_runs SET superseded_at = now() WHERE engine_version = '<old>'`).
4. If they match: the error was a spurious race — but the alert-rule shouldn't fire on match, so investigate the `beforeSend` path.

**Gate:** Do not enable this alert until ADR-004 Phase 5A ships. Pre-5A, the proof test is the enforcement; post-5A, the Sentry alert is the canary.

---

## Tier 2 — Investigation queue

Events in this tier represent *quality signals that need review within 24 hours but don't require paging*. Route to Slack + daily-review digest.

### 2.1 — `OrchestratorTimeoutError` at ≥5/day

**Pattern:** `tags.financial_error_class:"OrchestratorTimeoutError"` + count ≥ 5 per rolling 24h.
**Threshold:** Rate-based.
**Channel:** Slack #alerts-analyst (no page).

**Why this tier:** one timeout is noise (network, temporary API slowness). Five in a day suggests persistent degradation — model provider issue, internal rate-limiting, or a prompt that's genuinely too long. Needs eyes, not pager.

**Response checklist:**
1. Group by `phase` in the payload — where are timeouts happening? (relaxation / panel-a / panel-b / validation / synthesis)
2. Check model-provider status pages for the affected phase's model.
3. If synthesis phase dominates: verify Opus isn't throttling; check prompt size.
4. If no external cause: investigate the code path — is there a new slow step we introduced?

### 2.2 — `FieldDefinitionHintViolationError` (any)

**Pattern:** `tags.financial_error_class:"FieldDefinitionHintViolationError"`
**Threshold:** Any event.
**Channel:** Slack #alerts-analyst.

**Why this tier:** this should never fire in production — it's a build-time rule enforcement via `tests/proof/field-definitions-no-hints.test.ts`. If it reaches runtime, somebody bypassed the proof test or the proof test has a regex gap. Need to fix both the runtime FIELD_DEFINITIONS entry AND the proof test that let it through.

Not Tier 1 because production-side impact is recoverable (worst case is a minor mode-collapse on one field until the next deploy).

### 2.3 — `ContractMigrationParityMisuseError` (any)

**Pattern:** `tags.financial_error_class:"ContractMigrationParityMisuseError"`
**Threshold:** Any event.
**Channel:** Slack #alerts-analyst.

**Why this tier:** a migration PR attempted raw-output parity testing across mismatched contract shapes. Shouldn't reach production — the rule `.claude/rules/llm-contract-migration-parity.md` enforces this at review time. If it fires: a migration's parity gate is subtly wrong, future migrations in the same PR may also be misspecced.

---

## Tier 3 — Weekly digest

Events in this tier are *baseline operational signals* that don't need per-event attention but should be reviewed in aggregate weekly.

### 3.1 — All `financial:true` events not covered by Tier 1/2

**Pattern:** `tags.financial:"true"` (excluding classes already routed to Tier 1/2).
**Threshold:** Weekly summary email.
**Channel:** Email to engineering-leads@.

**Why this tier:** catch-all. New `FinancialSentryError` subclasses added without explicit routing fall here until someone tiers them. Prevents silent backlog.

**Weekly review agenda (15 min):**
1. Total financial events this week.
2. Breakdown by `financial_error_class`.
3. Any class with > 0 events and no explicit tier → classify into Tier 1/2/3 and add the alert rule in the next sprint.
4. Trend line: week-over-week — any class going up?

### 3.2 — NaN-coercion detection (custom)

**Pattern:** SQL-based, not Sentry-tag-based:

```sql
SELECT id, scenario_id, entity_type, entity_id, assumption_key,
       value_low, value_mid, value_high, created_at
FROM assumption_guidance
WHERE value_mid = 0
  AND (value_low != 0 OR value_high != 0)
  AND created_at > now() - interval '1 hour';
```

**Threshold:** Any row returned in the rolling 1-hour window.
**Channel:** Slack #alerts-data (automated query, not from Sentry).

**Why this tier:** the NaN-coercion bug in `extractGuidance` (see `.claude/replit-handoffs/nan-coercion-extractguidance-fix.md`) was identified but not fixed during OT-A.4. The OT-A.5 authorization gate includes this detection in its clause 2. Once the NaN fix ships (post-OT-A.5, OT-B), this alert can downgrade to Tier 3 weekly digest. Until then: kept active in the T+72h observation window, then converted to a permanent monitoring query.

### 3.3 — OT-A.3 era error classes post-fix

Once the `FieldDefinitionHintViolationError`, `EngineVersionDriftError`, `ContractMigrationParityMisuseError` classes have had zero production events for 30 days, downgrade to Tier 3 digest. Early lifecycle stays Tier 2 as active observation.

---

## Alert-rule configuration (Sentry side)

When Replit (or whoever wires this) sets up the rules:

1. **Environment filter:** all rules apply to `environment:production` only. Dev/preview events are noise.
2. **Release tagging:** include `release` in the event payload so alerts can cite the affected commit.
3. **Ignore-list:** events matching `tags.known_issue:true` get excluded from ALL alert rules. Use for intentionally-failing regression tests in production debugging.
4. **Rate-limit protection:** Tier 1.2 and 2.1 are rate-based. Sentry's issue-level alert with "frequency ≥ N over M period" matches the pattern. Configure at the project level.
5. **Audit-trail requirement:** every time an alert fires, the resolution must land in a commit (either a code fix, a test to cover the bug, a BLOCKED.md, or a deliberate silence with justification). No alert resolves by being dismissed.

---

## What this runbook does NOT cover

- Non-financial Sentry events (generic 500s, frontend crashes, auth errors). Those have their own rules (or they should — file a separate runbook).
- PostHog product-analytics events. Different platform, different purpose.
- Infrastructure alerts (DB connections, memory, CPU). Replit/ops platform.
- Sentry cost / quota alerts. Tooling-level, not financial.

---

## Related

- `docs/operational-tooling/HANDOFF-replit-sentry-financial-contexts.md` — the wiring handoff that promises this runbook
- `docs/architecture/DEPENDENCIES.md` §13 Observability + analytics — Sentry stack overview
- `docs/operational-tooling/HANDOFF-replit-posthog-wiring.md` — parallel handoff for product-analytics side
- `.claude/rules/error-handling.md` — structured error pattern `[LEVEL] [domain] message`
- `.claude/rules/balance-sheet-identity.md` — what drives `BalanceSheetImbalanceError`
- `.claude/rules/analyst-verdict-contract.md` — what drives `VerdictInvariantError`
- `.claude/rules/field-definitions-no-prescription-hints.md` — what drives `FieldDefinitionHintViolationError`
- `.claude/rules/llm-contract-migration-parity.md` — what drives `ContractMigrationParityMisuseError`
- `server/ai/engine-version.ts` — what drives `EngineVersionDriftError` post-Phase-5A
- `.claude/replit-handoffs/nan-coercion-extractguidance-fix.md` — fix path for the NaN-coercion pattern §3.2 watches
