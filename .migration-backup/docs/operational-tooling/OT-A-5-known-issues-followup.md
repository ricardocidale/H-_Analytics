# OT-A.5 — Known issues + post-OT-A.4-flip follow-up

**Date filed:** 2026-04-19
**Phase:** OT-A.5 design / OT-A.4 production observation window
**Status:** Living doc — rolls forward `OT-A-3-known-issues.md` into
the post-flip state. Updated when (a) v6 ships, (b) post-flip Sentry
trips a regression, or (c) OT-A.5 anchor outcomes change classifications.
**Cross-refs:**
  - `OT-A-3-known-issues.md` — parent doc (v5 result analysis)
  - `OT-A-3-parity-exemptions.md` — exemption framework
  - `OT-A-5-design.md` — sibling design doc (anchor proposals)
  - Commit `7da9f25a` — OT-A.4 Path A1 flip

## Purpose

OT-A.4 closed the migration arc by retiring the legacy regex-based
`extractResearchValues` path entirely. Several known issues from the
OT-A.3 era either:
  - Are now resolved by structure (e.g., schema-validation enforcement
    via `streamObject` makes a class of malformed-output bugs
    impossible),
  - Persist but with reframed scope (e.g., parity-exempt fields now
    flow through `synthesisOutputToLegacyJson` rather than the
    deleted regex extractor — the exemption logic is identical, the
    runtime path differs), or
  - Are newly visible because the v5 anchor edits' regressions are
    now baked into production prompts.

This doc tracks each item in its post-flip form so OT-A.5 work and
v6 batch design are anchored to the current production state, not
the pre-flip state.

## Resolved by OT-A.4 structure

These are no longer live concerns; recorded for audit trail only.

| Pre-OT-A.4 issue | Status | Why resolved |
|---|---|---|
| Regex extractor's NaN-coercion fallback for malformed Opus output | **Resolved** | `streamObject` Zod-validates SynthesisOutput before the adapter runs; malformed output throws and falls back to single-model via the new `ORCHESTRATOR_BOTH_FAILED` guard (orchestrator lines 494–501). The NaN path cannot be reached. |
| `extractResearchValues` regex maintenance burden | **Resolved** | File deleted. `synthesisOutputToLegacyJson` adapter is now the only conversion layer; 80 LOC of typed Zod-driven mapping vs. ~400 LOC of regex. |
| Streaming-shape bug (orchestrator yielding `JSON.stringify(partial)` per tick, corrupting `fullContent` accumulator in `routes/research.ts`) | **Resolved** | Orchestrator drains partials silently and yields a single terminal `content` event with the legacy envelope (orchestrator lines 467–475). |
| `USE_AI_SDK_SYNTHESIS` env flag drift between dev/prod | **Resolved** | Flag and the corresponding `else` branch deleted — no flag, no drift. |

## Persists with reframed scope

These are still real issues but their runtime surface changed at the
flip; the OT-A.5 design treats them in their post-flip form.

### `inflationRate` Class 4 status

**Pre-flip:** OT-A.3 v5 raw showed bias-down −13.3% with uniq=6 vs.
legacy LEA panel's per-market reasoning. Tentatively Class 2,
reclassified Class 4 by Q1 review.

**Post-flip:** Identical numeric behavior — `synthesisOutputToLegacyJson`
preserves the same value-range envelope the regex extractor produced,
and `extractGuidance` consumes it identically. The flip did not move
the field's classification.

**OT-A.5 Q1-extended verification (2026-04-19, no API spend):**
Tabulation of `(market, legacy.inflationRate.mid, new.mid)` across all
20 v5 cases revealed that **all 20 cases are US markets** — the
mono-country sample cannot test the country-awareness precondition
that Class 2 (PROMOTED) requires. Outcome: **DEFER**. `inflationRate`
stays Class 4; **Section A REMOVED from v6 batch**. Filed for OT-A.6
with a small targeted LEA trace gate ($3–5, 4–6 mixed-country cases).
See `OT-A-3-parity-exemptions.md` §"Q1-extended finding" for the
per-case table and decision detail.

What the existing data DID confirm (useful for OT-A.6 scoping):
  - Legacy is NOT hard-coding a single USA constant — it varies
    bimodally (2.8% / 3.2%) within the same country, consistent with
    Q1's finding that the extractor parses LEA panel output.
  - Mean Δ −13.5% confirmed against v5 reported −13.3%.
  - Both paths sit inside the current US CPI band (~2.5–3.2%).

### Mode-collapsed fields outside T1

  - `costFB` (T2, uniq=2)
  - `costSeg5yrPct` (T3, uniq=2)
  - `svcFeeGeneralMgmt` (T3, uniq=2)
  - `svcFeeTechRes` (T3, uniq=2)

**Pre-flip:** Tracked in `OT-A-3-known-issues.md` "Explicit lists for
OT-A.4 closeout" as deferred-to-OT-A.5.

**Post-flip:** Same uniq counts persist (the adapter passes through
the new path's range outputs unchanged). Section C of
`OT-A-5-design.md` classifies each:
  - `costFB` → Class 1 (industry-standard single-value, persona-narrowing).
  - `costSeg5yrPct` → Class 2 (needs anchor). **OT-A.5 prep diff result
    (2026-04-19, no API spend):** v3.3 cost-seg block at
    `synthesis-schema.ts:203–205` is byte-identical between commit
    `e5d873fe` and HEAD. v3.3 anchor is intact; v5 −26.7% bias is a
    real regression the v3.3 wording failed to prevent. **Strengthen
    in v6** (IRS Cost Seg Audit Techniques Guide source pointer per
    C.2 design); restore-only is not sufficient.
  - `svcFeeGeneralMgmt`, `svcFeeTechRes` → defer to watchlist.

### 6 T2 USALI cost-line biases

`costHousekeeping`, `costMarketing`, `preOpeningCosts`,
`startOccupancy`, `catering`, `costPropertyTaxes`.

**Pre-flip:** Tracked in `OT-A-3-known-issues.md` "Deferred to OT-A.5
— Tier-2 USALI cost-line biases (6 fields)" with hypothesis-only
remediation notes.

**Post-flip:** Bias signatures unchanged — adapter is value-preserving.
Section B of `OT-A-5-design.md` proposes per-field anchor wordings.

### T3 watchlist entries

  - `costSeg15yrPct` (inclusion 65%, signed −25.0% ± 7%, bias-down).
  - `svcFeeAccounting` (inclusion 35%, signed −39.4% ± 14%, bias-down).

**Pre-flip:** Acknowledged-as-borderline in `OT-A-3-known-issues.md`
"Acknowledged-as-noise (do not fix)".

**Post-flip:** Unchanged. Re-evaluate as ripple effect post-v6 if
the cost-seg anchor (C.2) restores the v3.3 pattern; small NPV
impact means these stay deferred even if v6 anchor design doesn't
help directly.

### `incentiveFee` 1-unique-range exemption

**Pre-flip:** Class 1 exempt per `OT-A-3-parity-exemptions.md`.

**Post-flip:** Exemption logic preserved via `KNOWN_COLLAPSE_EXEMPT`
in `script/ot-a-3-verdict-parity.ts`. The field flows through the
adapter identically to all other Class 1 fields.

### Sub-string-path NaN-coercion latent bug

**Pre-flip:** `extractGuidance` had a NaN-coercion fallback in its
sub-string path (affecting `adrGrowth`, `occupancyStep`, `ltv`,
`inflationRate`, `rampMonths`). Documented as historic and out of
scope for OT-A.4.

**Post-flip:** Bug persists (the adapter feeds `extractGuidance`
the same envelope shape; downstream behavior unchanged). **Fix-path
out of scope for OT-A.5** — file under OT-B (downstream-extractor
hardening). **However**, the affected fields include T1 members
(`ltv`, `inflationRate`); silent-wrong guidance on T1 is materially
worse than any OT-A.4 parity error, so the **detection** of this
bug IS in-scope for the T+72h Sentry watchlist (see authorization
gate clause 2 below).

## Newly introduced by OT-A.4

### Zod-validation failure → fallback path observability

**Issue:** The new `try`/`catch` around `streamObject` (orchestrator
lines 494–501) surfaces validation failures as the
`ORCHESTRATOR_BOTH_FAILED` sentinel. This is correct routing
behavior, but production-side observability needs a Sentry filter
distinguishing "synthesis Zod failure" from "dual-panel research
failure" — currently both surface with the same sentinel string
prefix.

**Action item (low-cost, no API spend):** Add a Sentry tag
`fallback_reason: "synthesis_zod" | "dual_panel"` at the orchestrator
catch site and at the existing dual-panel catch site (line 385).
Bundle into the v6 commit if v6 ships; otherwise file as standalone
post-flip patch.

**Severity:** Low (correct behavior, missing observability tag).

### Engine-version + fingerprint cache invalidation

**Issue:** OT-A.4 bumped `ENGINE_VERSION` v1-2026-04-20-b →
v2-2026-04-20-a and recomputed `SYNTHESIS_FINGERPRINT` to
`786aae35…`. All cached research results from v1 are now invalid
and will re-fetch on next request. This is **expected** behavior
(intentional — the adapter is part of the engine contract), but
production cost will spike on the first user-touch of each cached
property until the v2 cache warms.

**Action item:** Monitor cost dashboard for the 72-hour observation
window. Expected cost delta: ≤ $30 across the L+B portfolio
(cache miss × ~30 properties × ~$1/research call). If cost spike
exceeds $50, investigate whether cache key construction changed
inadvertently.

**Severity:** Low (expected, time-bounded).

### Adapter PCT-scaling discipline

**Issue:** `synthesisOutputToLegacyJson` scales section-node
`valueLow / valueMid / valueHigh` to **decimal** (mid/100) because
`extractGuidance`'s SANITY_BOUNDS are decimal; string fields
(`display`, `recommendedRange`) stay raw ("30%"). Verified safe
end-to-end via the 8-test adapter harness. **Not** a bug; recording
here so future OT-A.5 / OT-A.6 work does not assume the envelope
is uniformly raw or uniformly decimal.

**Severity:** None — discipline note for future contributors.

## v6 authorization gate (re-stated for convenience)

Per `OT-A-5-design.md`, do not authorize the $22 v6 rerun until
**all of**:
  1. T+72h elapsed since 2026-04-19 18:14 UTC (eligible 2026-04-22
     18:14 UTC).
  2. **0** Sentry parity-related errors in the
     `extractGuidance` / `synthesisOutputToLegacyJson` /
     `routes/research.ts:522` paths during the window, **AND**
     **0** hits on the NaN-coercion detection pattern below.
     - **Detection pattern:** any `assumption_guidance` INSERT row
       with `valueMid = 0` for a field where `valueLow ≠ 0` OR
       `valueHigh ≠ 0` is a smell — the sub-string-path NaN-coercion
       bug in `extractGuidance` has fired and silently zeroed the
       midpoint while the bounds remain populated.
     - **Affected fields to alert on (priority):** `ltv`,
       `inflationRate` (T1); `adrGrowth`, `occupancyStep`,
       `rampMonths` (T1/T2 secondary).
     - **Action on hit:** file `BLOCKED-post-ota4-flip.md`, pause
       OT-A.5, escalate. T1 silent-wrong guidance is worse than
       any parity drift; do not advance to v6 spend until the
       NaN-coercion fix-path (OT-B) ships or the affected rows
       are remediated.
  3. **0** user reports of research-output regressions.
  4. `OT-A-5-design.md` user-reviewed and anchor wordings approved.
  5. **Final user ack** to spend the $22 (separate from doc approval).

If any of (1)–(5) fail: file `BLOCKED-post-ota4-flip.md`, pause
OT-A.5, address regression first.

## Watchlist (post-v6 re-evaluation)

  - `svcFeeGeneralMgmt` — Section C.3 deferred; re-check uniq post-v6.
  - `svcFeeTechRes` — Section C.4 deferred; re-check uniq post-v6.
  - `costPropertyTaxes` — Section B.6 may absorb without explicit
    anchor help; if v6 shows it passing, retain anchor as documentation.
  - `catering` — Section B.5 borderline noise; reclassify Class 3 if
    σ remains > |Δ| post-anchor.
  - `costSeg15yrPct` — T3 watchlist; re-check ripple from C.2.
  - `svcFeeAccounting` — T3 watchlist; re-check ripple from B.x.
  - `adrGrowth` — Class 3 exempt; check if inflation anchor (Section A)
    ripples it cleanly clear of the noise floor.
