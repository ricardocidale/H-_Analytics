# OT-A.3 — Opus Synthesis A/B Parity Results

**Date:** 2026-04-19T07:34:23.981Z
**Inputs:** 1 boutique-luxury market scenarios
**Model:** claude-opus-4-6
**New path:** `streamObject({ schema: SynthesisOutputSchema })` via Vercel AI Gateway with Anthropic ephemeral cache_control
**Old path:** `anthropic.messages.stream()` direct (Phase OT-A.1 caching preserved)
**Concurrency:** 5
**Harness:** `script/ot-a-3-ab-harness.ts`

---

## Pass / Fail Summary

| Criterion | Threshold | Observed | Result |
|---|---|---|---|
| Severity match (mid within ±5%) ≥ 95% | — | 35.9% | FAIL |
| buildAnalystVerdict path completes both legs | — | old=1/1 new=1/1 schema=1/1 | PASS |
| Zero FORBIDDEN_VOICE_PATTERNS violations on new path | — | 0 violations | PASS |
| Latency regression ≤ 20% | — | 34.8% | FAIL |

**Overall:** **FAIL** — do NOT proceed to OT-A.4. Investigate failing criteria below before retry.

---

## Aggregate

- Old path completion: 1/1
- New path completion: 1/1
- New path schema-valid (SynthesisOutputSchema): 1/1
- Total shared fields across all cases: **39**
- Shared fields within ±5% midpoint: **14** (35.9%)
- Voice violations (new path total): **0**
- Voice violations (old path total): **0**
- Latency: old avg=70818ms · new avg=95428ms · regression=34.8%

---

## Per-case rollup

| # | Market | old✓ | new✓ | old fields | new fields | shared | within ±5% | parity | old ms | new ms | new voice viol |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Charleston, SC | ✓ | ✓ | 40 | 40 | 39 | 14 | 35.9% | 70818 | 95428 | 0 |

---

## Detail

### Case 01 — Charleston, SC
  - Status: old=OK new=OK
  - Latency: old=70818ms new=95428ms
  - **Field set drift:** old-only=[landValue] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costPropertyTaxes | 1.2 | 4.5 | 275.0% |
      | preOpeningCosts | 2200000 | 750000 | 65.9% |
      | rampMonths | 21 | 30 | 42.9% |
      | occupancyStep | 8.5 | 12 | 41.2% |
      | revShareEvents | 8 | 5 | 37.5% |

---

## Notes

- **Path semantics.** Both paths consumed the same user prompt with ephemeral cache_control on the system message. The system prompts differ by design (post-OT-A.3 schema-tightening, commit e89d77441): the old path receives the legacy free-form-JSON instructions and is regex-parsed by `extractResearchValues`; the new path receives the structured-output contract (field-key enum + ≤500-char one-sentence reasoning) and is parsed via `toLegacyResearchValuesMap`. Using a single shared prompt for both paths was tried in the previous run and produced ad-hoc field names that broke parity — see prior commit 12363142.
- **Field set drift is expected.** The new path emits whatever fields the model decides are answerable under the schema; the old extractor only fills slots it can regex-match. `shared` is the meaningful comparison surface; `old-only` / `new-only` are diagnostic, not a failure signal.
- **Severity criterion.** Per-handoff "severity match" is interpreted operationally as midpoint convergence within ±5% on shared fields, since severity in the AnalystVerdict contract is downstream of the numeric range. Stricter severity-bucket comparison would require running each case through buildAnalystVerdict twice — out of scope for this harness.
- **Cost.** Real Opus spend on user's Anthropic billing. Authorized.
- **Rollback.** Setting `USE_AI_SDK_SYNTHESIS=false` (or unset) restores the legacy path immediately. No code revert needed.
