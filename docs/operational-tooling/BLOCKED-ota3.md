# OT-A.3 — BLOCKED

**Date:** 2026-04-19
**Phase:** OT-A.3 (Vercel AI SDK structured-output A/B parity)
**Status:** BLOCKED on the v3 retry plan; requires user decision before further $22 reruns or Path 3 build.

## What contradicted the plan
The Path 1 v3 commits (`cd397044`, `8038981d`) shipped, the 20-case A/B reran (commit `0a1f4357`, ~$22), and the headline result looked salvageable: aggregate 41.5% (still failing the 80% gate but moving directionally), categorical-gate clean (0 unit/denominator/scope/voice/schema errors), latency 1.57× (PASS).

Per-case range analysis (post-hoc, from `OT-A-3-ab-raw.json`) revealed the headline numbers are misleading: the new structured-output path is **mode-collapsing** on the fields where Path 1 reported the largest "wins."

| Field | unique ranges across 20 markets (legacy) | unique ranges across 20 markets (new SDK path) |
|---|---|---|
| `rampMonths` | 3 | **1** (24-30-36 verbatim on all 20) |
| `incentiveFee` | 2 | **1** (8-10-12 verbatim on all 20) |
| `costSeg5yrPct` | 5 | **1** (18-22-25 verbatim on all 20) |
| `costSeg15yrPct` | 4 | **1** (10-14-18 verbatim on all 20) |
| `occupancy` | 6 | 7 (preserved — definition has no typical-range hint) |
| `svcFeeRevMgmt` | 2 | 3 (mostly preserved) |

The high bucket-match rates on `rampMonths` (65%) and `incentiveFee` (90%) are **prescription wins, not reasoning wins** — the new path emits the same range for every market, and bucket-match passes whenever that range happens to bracket the legacy market value. Aspen and Outer Banks now receive identical ramp curves and identical incentive-fee structures.

## Root cause
Every `FIELD_DEFINITIONS` entry in `server/ai/synthesis-schema.ts` that includes a "typical X–Y%" hint is treated by Opus as a strict prescription rather than a calibration aid. Inspection:

- Mode-collapsed fields all have explicit typical ranges in the definition (added in cd397044 + 8038981d for "improved Opus grounding").
- Fields without typical-range hints (`occupancy`, `svcFeeRevMgmt`) preserve per-market reasoning normally.

## Why this matters for OT-A.4
The plan's revised unblock criterion calls for verdict-layer parity ≥ 95% on severity + action.kind. With the new path mode-collapsed, verdict parity will mechanically PASS for any ramp/incentive/cost-seg-driven verdict — both paths emit the same numbers, so they reach the same verdict. **But the new path has lost the per-market intelligence the legacy path carries**, and Path 3 would not detect this. We would ship OT-A.4 with a measurably degraded analyst product even with all gates green.

## What was changed in this session
1. `server/ai/synthesis-schema.ts` — removed the "Typical X–Y%" hints from `costSeg5yrPct`, `costSeg7yrPct`, `costSeg15yrPct`. Replaced with per-market reasoning prompts naming the actual evidence sources (FFE share, equipment profile, site improvements).
2. `server/ai/research-orchestrator.ts` — added "PER-MARKET REASONING REQUIRED (anti-collapse rule)" block to the structured-output system prompt. Tells Opus explicitly that field-definition typical ranges are calibration aids, not target values, and that two materially different markets MUST produce materially different numbers on rate-sensitive fields.
3. Deferred any further API-spend reruns until user decides.

NOT YET DONE:
- `rampMonths` and `incentiveFee` definitions still carry typical-range hints (in cd397044). Recommend removing those too on the next pass — same mode-collapse mechanism.
- Audit pass over the rest of `FIELD_DEFINITIONS` for other typical-range hints that could collapse other fields silently.

## Decision needed from user
**Q1.** Authorize one ~$22 v4 rerun to verify the anti-mode-collapse changes restore per-market variance? Suggested success criterion: per-field unique-range count on `rampMonths`/`incentiveFee`/`costSeg*` rises to ≥ 4 distinct ranges across the 20 markets.

**Q2.** If Q1 lands, proceed to Path 3 (verdict-layer parity harness, ~4 hr build + ~$22 rerun)? Or rerun bucket-match first to confirm the noise-floor framing still holds with mode collapse fixed?

**Q3.** Should I do a defensive audit of `FIELD_DEFINITIONS` for other typical-range hints before the v4 rerun (free, 15 min)? Recommend yes — would catch sibling collapses like `preOpeningCosts` ("typical $200K–$2M") proactively.

## Files touched (uncommitted at write-time)
- `server/ai/synthesis-schema.ts` — cost-seg defs rewritten without typical ranges
- `server/ai/research-orchestrator.ts` — anti-collapse rule injected
- `docs/operational-tooling/BLOCKED-ota3.md` — this file
