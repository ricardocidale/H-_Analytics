# Kickoff — OT-A.3 A/B Retry (post schema tightening)

**For:** Replit Agent
**From:** Claude Code
**Date:** 2026-04-19
**Prerequisite commit:** `e89d7744` — synthesis-schema.ts tightened (field enum, narrative[] removed, reasoning cap 500)
**Prior A/B commit:** `12363142` — first A/B run that found the issues this retry addresses

Paste the block below into Replit Agent to resume OT-A.3 after the synthesis schema was tightened and the Vercel AI Gateway credit balance was restored. The full brief is `docs/operational-tooling/HANDOFF-replit-phase-OT-A.md` §OT-A.3; this kickoff is the focused retry instructions.

---

## Paste this

```
Resume OT-A.3 A/B with three schema changes now landed (commit e89d7744):

1. `field` is now z.enum(CANONICAL_RESEARCH_FIELDS) — 41 canonical
   keys listed in server/ai/synthesis-schema.ts. Opus will get
   ZodError on any non-canonical field name.

2. DescriptiveResearchValueSchema and SynthesisOutput.narrative[]
   removed. No narrative block in the output.

3. reasoning max length cut 1200 → 500 chars.

Before rerunning the A/B, update the synthesis system prompt in
server/ai/research-orchestrator.ts:

(a) After the existing "Now synthesize the above into a single
    authoritative research report JSON." instruction, add an
    enumeration of the allowed field keys:

    "Each numeric value in `values[]` must use `field` from this
     EXACT list (case-sensitive; no variants, no paraphrases, no
     descriptors in parens):
       adr, adrGrowth, occupancy, startOccupancy, occupancyStep,
       rampMonths, catering, revShareFB, revShareEvents, revShareOther,
       capRate, landValue, saleCommission, costHousekeeping, costFB,
       costAdmin, costMarketing, costPropertyOps, costUtilities,
       costFFE, costIT, costOther, costPropertyTaxes, incentiveFee,
       svcFeeMarketing, svcFeeTechRes, svcFeeAccounting, svcFeeRevMgmt,
       svcFeeGeneralMgmt, svcFeeProcurement, incomeTax, inflationRate,
       interestRate, ltv, costSeg5yrPct, costSeg7yrPct, costSeg15yrPct,
       arDays, apDays, preOpeningCosts, platformFee.
     Only include fields you have real evidence for — omit the rest."

(b) Remove any existing prompt text that instructs Opus to produce
    qualitative narrative blocks.

(c) Tighten any existing reasoning-field instruction to "one tight
    sentence citing top 2-3 sources".

Then rerun the 20-case A/B harness. Update
docs/operational-tooling/OT-A-3-ab-results.md with the new run.

DIAGNOSTIC FIRST: after case 1 completes, check the Vercel AI Gateway
balance in the dashboard. If it dropped by more than a few cents, BYOK
isn't actually routing tokens to our direct provider keys — STOP the
harness and flag it. Tokens should be billed to our Anthropic account
directly, not to Gateway credits. Fixing that before running 20 cases
prevents double-billing.

New parity criteria for this rerun:
  - Field overlap ≥ 95% per case (was ~0% for most; enum + prompt
    should fix at the source)
  - Latency regression ≤ 2x (was 3x; target is 2x after schema trim)
  - Schema validity 100% (was 11/11; should stay green; if the enum
    rejects Opus output, surface those cases as a prompt problem)
  - All other criteria from the original handoff unchanged

Report back with:
  - Pass/fail per criterion
  - Actual latency multiplier (54s baseline — what's the new number?)
  - Any cases where Opus produced a non-canonical field name despite
    the prompt (suggests prompt needs more emphasis)
  - BYOK diagnostic: did Gateway balance drop on case 1?

If pass: Claude Code queues OT-A.4 (delete old path + extractor).
If fail on latency but field overlap ≥ 95%: user decision on whether
to accept a particular multiplier between 2x and 3x.
If fail on field overlap: bigger prompt-wording problem; escalate.
If BYOK not working: stop everything; diagnose routing before rerunning.
```

---

## Context for this retry

The first A/B run (`12363142`) shipped the OT-A.3 feature-flag path and ran 18/20 cases before hitting HTTP 402 on Vercel AI Gateway (credits depleted on case 19). The partial results were conclusive:

| Criterion | First run (12363142) | Target this retry |
|---|---|---|
| Schema validity | 11/11 PASS | ≥ 99% |
| Field-name overlap | 7 of 11 cases had **zero** overlapping keys | ≥ 95% per case |
| Latency regression | +190% (157s vs 54s) | ≤ 2× (≤ 108s) |
| Voice violations | inconclusive (raw outputs not persisted) | 0 |

Root cause of field-name divergence: `field` was `z.string()` and Opus invented verbose ad-hoc names like `"Occupancy Rate (Stabilized Year 3)"` instead of the canonical `"occupancy"`. This retry's schema change (commit `e89d7744`) makes that structurally impossible — the enum is enforced at Zod validation time — but Opus also needs to be *told* the new constraint via the prompt update above.

---

## Expected outcomes + follow-ups

**If the retry passes:** paste the OT-A.4 kickoff (I'll draft it once I see the results). OT-A.4 deletes `research-value-extractor.ts`, retires the old synthesis path, closes the OT-A track.

**If it passes on field overlap but still > 2× latency:** user decision. Gatew may need deeper tuning (prompt caching on new path, smaller synthesis prompt, etc.) or we abandon OT-A and keep the extractor.

**If it fails on field overlap:** means the prompt wasn't emphatic enough OR Opus is ignoring the enum constraint despite Zod's validation. Bigger problem — escalate and we'll look at the raw outputs case-by-case.

**If BYOK isn't working:** stop and fix. We should NOT spend another $20 on Gateway credits when tokens should be flowing to our Anthropic account.

---

## Parallel work that's queued behind this

- **OT-A.4** — delete old synthesis path + `research-value-extractor.ts` (gated on this A/B passing)
- **Sentry financial contexts handoff** — ready to execute once OT-A track closes
- **PostHog wiring handoff** — ready after Sentry

All three handoffs are already committed in-repo. Don't start any of them until OT-A.3 concludes cleanly.
