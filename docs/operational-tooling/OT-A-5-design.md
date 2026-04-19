# OT-A.5 — Design pass (draft, no API spend)

**Date filed:** 2026-04-19
**Phase:** OT-A.5 design — drafted during the 72-hour OT-A.4 production
observation window. **No API spend authorized this week.**
**Status:** DRAFT awaiting user review. Authorization gate at T+72h
post-OT-A.4 flip (commit `7da9f25a`).
**Cross-refs:**
  - `OT-A-3-known-issues.md` — v5 result analysis (parent doc; this
    draft replaces its "Out-of-scope for OT-A.5 (parking)" section)
  - `OT-A-3-parity-exemptions.md` — exemption framework + Q1/Q2 record
  - `OT-A-3-field-tiering.md` — 41-field tiering
  - `OT-A-5-known-issues-followup.md` — sibling doc tracking OT-A.4
    post-flip state

## Authorization gate

Single $22 v6 A/B rerun validating ALL OT-A.5 anchors together
(below). **Do not authorize until** all of:
  1. T+72h elapsed since OT-A.4 flip (commit `7da9f25a` at
     2026-04-19 18:14 UTC → eligible 2026-04-22 18:14 UTC).
  2. Sentry shows **0 parity-related errors** in the
     `extractGuidance` / `synthesisOutputToLegacyJson` /
     `routes/research.ts:522` paths for the full window.
  3. **0 user reports** of research-output regressions in the same
     window.
  4. This doc is reviewed and the anchor wordings below are user-approved.

If any of (1)–(4) fail: pause OT-A.5; file
`BLOCKED-post-ota4-flip.md` documenting the failure mode; resolve
OT-A.4 regression first; re-draft this doc against the post-fix
state.

## Scope of v6 batch (one rerun, three workstreams)

  1. **Section A** — `inflationRate` Class 2 promotion (1 field, design
     spec + legacy-evidence write-up; no anchor wording change required
     IF Q1 verification holds).
  2. **Section B** — 6 T2 USALI anchors (`costHousekeeping`,
     `costMarketing`, `preOpeningCosts`, `startOccupancy`, `catering`,
     `costPropertyTaxes`). Each gets an anchor proposal naming a USALI
     benchmark **source**, not a value range — mechanism bug #2 rule
     applies (see `.claude/rules/llm-contract-migration-parity.md`).
  3. **Section C** — 4 non-T1 mode-collapsed fields (`costFB`,
     `costSeg5yrPct`, `svcFeeGeneralMgmt`, `svcFeeTechRes`). Each
     classified as (a) industry-standard exempt (Class 1), (b) needs
     per-market reasoning anchor, or (c) insufficient evidence → defer.

---

## Section A — `inflationRate` Class 2 promotion path

### Background

In OT-A.3 v5, `inflationRate` was tentatively classified Class 2
(legacy-inaccurate baseline) on the working assumption that legacy
hard-coded a USA CPI default. The 2026-04-19 Q1 legacy code review
overturned this and reclassified the field to **Class 4
(under-reasoned)**, blocking it from the OT-A.4 unblock pass.

Q1 review extract (from `OT-A-3-parity-exemptions.md`):

> Read `server/ai/research-value-extractor.ts:108–119`. The legacy
> `inflationRate` extractor does NOT hard-code USA CPI — it parses
> `c.localEconomics.inflationRate` from the upstream LEA
> (local-economic-analyst) panel output via `parsePct`. Same shape
> for `interestRate`. So legacy IS doing per-market reasoning (via
> the analyst panel) — Class 2's "hard-codes a wrong baseline"
> precondition does not hold.

### OT-A.5 design proposition

Re-verify Q1 against the **actual LEA panel prompt + observed LEA
outputs** (not just the extractor surface). Q1 only proved that legacy
*reads* `c.localEconomics.inflationRate` — it did not prove that the
LEA panel itself is country-aware vs. quietly defaulting to a
US/global rate per call.

#### Verification protocol (no API spend — uses v5 raw)

  1. Open `OT-A-3-ab-raw.json` (v5 raw). Filter `legacy.evidence` for
     each of the 20 cases for the LEA contribution to `inflationRate`.
  2. For each case, extract: `(country, legacy.inflationRate.mid,
     LEA-cited-source-string)`.
  3. Tabulate distinct legacy `inflationRate.mid` values vs. country.
  4. **Decision rule:**
     - **If ≥ 15/20 cases have country-matching CPI** (e.g., MX → 4.5%,
       BR → 4.2%, US → 2.5%) → Q1 confirmed; legacy LEA is
       country-aware. `inflationRate` STAYS Class 4. Section A
       proceeds with **prompt-reconciliation work** (align new-path
       inflation prompt to LEA's CPI sourcing methodology so the two
       converge).
     - **If ≥ 15/20 cases collapse to a single value (e.g., 2.5% USA
       default) regardless of country** → Q1 verification holds at
       extractor level only; LEA itself is country-CPI-ignorant.
       `inflationRate` is **promoted to Class 2 (legacy-inaccurate
       baseline)** with documented evidence. Parity-exempt becomes
       **permanent** for this field.
     - **Mixed (5–14/20 country-matching)** → insufficient evidence;
       defer the field to OT-A.6 and request a small targeted LEA
       trace ($3–5 spend gate).

#### Anchor wording (only used if outcome = STAYS Class 4)

If verification confirms LEA is country-aware, the new-path
`inflationRate` prompt needs reconciliation. Proposed anchor —
**still no value embedded; mechanism bug #2 rule preserved**:

> "When estimating `inflationRate` for the operating market,
> use the most recent annual CPI series published by the country's
> central bank or national statistical agency (e.g., BLS for US,
> INEGI for MX, IBGE for BR, ONS for UK). Cite the agency and
> the latest reading year. Do not substitute regional or global
> averages when a country-level figure is available."

This wording deliberately:
  - Names the **source class** (central bank / national stat agency),
    not a value table.
  - Provides illustrative agency examples for the four most-frequent
    L+B markets (US, MX, BR, UK) — bounded enumeration, not a
    prescriptive value list.
  - Forbids substitution to regional averages — addresses the v5
    failure mode where Opus picked a "Latin America 5%" composite
    rather than the country-specific reading.

#### Class 2 evidence template (only used if outcome = PROMOTED)

If verification shows legacy LEA collapses to a US default, the
exemption table in `OT-A-3-parity-exemptions.md` Class 2 gets a
real entry (replacing the placeholder `_(none)_` row). Template:

> | `inflationRate` | T1 | uniq=6, signed −13.3% ± 6%, bias-down | **Q1-revised finding 2026-04-22:** LEA panel output across 20 v5 cases collapsed to {N} distinct values (vs. 20 distinct countries); modal value was {X.X%} appearing in {M}/20 cases regardless of country. New path correctly varies per-country (uniq=6) and the −13% signed bias is **directionally correct** — the new path emits closer to country-specific CPI; legacy is anchored to a US/global default propagated by the LEA panel. Parity-exempt is permanent for this field. |

(Numeric placeholders to be filled at verification time; the
verification step is **no-API-spend** — it reads existing v5 raw.)

### Acceptance for Section A

Q1 re-verification completed against `OT-A-3-ab-raw.json`; one of
the three branches (STAYS / PROMOTED / DEFER) recorded with cited
case-counts in `OT-A-3-parity-exemptions.md`. v6 anchor wording
included in batch only if branch = STAYS.

---

## Section B — 6 T2 USALI cost-line anchor proposals

All 6 share the mechanism: definition is correct (USALI-standard
denominator) but lacks a benchmark **source pointer** in the prompt,
so Opus regresses to a generic industry-median that disagrees
systematically with the legacy panel's per-market evidence draw.

**Anchor design rule (mechanism bug #2 rule):** every anchor below
names the USALI benchmark **publication / source body**, not a value
or value range. The prompt tells Opus where to look; it does not tell
Opus what answer to find. This is the discipline that worked for
the cost-segregation fields in v3.3 and failed for the strip-hints
+ generic-reasoning pattern in v5.

### B.1 — `costHousekeeping` (+43% bias-up; new ~30%, legacy ~21%)

**Proposed anchor:**

> "Express `costHousekeeping` as a percentage of rooms revenue,
> following USALI 12th edition Schedule 1 (Rooms — Departmental
> Expenses). For boutique-luxury benchmarks, reference the most
> recent annual STR HOST Almanac or CBRE Trends in the Hotel
> Industry chapter on Rooms departmental costs. Cite the
> publication, edition/year, and the specific segment band used."

**Rationale:** STR HOST Almanac and CBRE Trends are the two
recognized sources publishing per-segment housekeeping cost ratios.
The v5 +43% bias suggests Opus is anchoring on an unsegmented
"all hotels" median (~30% of rooms revenue) rather than the
boutique-luxury band (~21–25%). Naming the publications — not the
value — preserves mechanism discipline.

### B.2 — `costMarketing` (+28% bias-up; new ~6.5%, legacy ~5%)

**Proposed anchor:**

> "Express `costMarketing` as a percentage of total revenue,
> following USALI 12th edition Schedule 5 (Sales & Marketing —
> Undistributed). For benchmarks, reference the most recent annual
> STR HOST Almanac Sales & Marketing chapter or CBRE Trends in the
> Hotel Industry undistributed-expense tables. Distinguish branded
> vs. independent operations in the citation, since branded
> properties typically run lower direct marketing spend (offset by
> svcFeeMarketing chain assessments)."

**Rationale:** v5 +28% bias indicates Opus is double-counting
brand-marketing spend that for an L+B branded property flows
through `svcFeeMarketing` instead of `costMarketing`. The anchor's
final sentence forces the branded-vs-independent distinction
explicitly — a USALI presentation rule, not a value prescription.

### B.3 — `preOpeningCosts` (−36% bias-down; new ~$1.2M, legacy ~$1.9M)

**Proposed anchor:**

> "Estimate `preOpeningCosts` as a per-key dollar figure for the
> property, following the ISHC (International Society of Hospitality
> Consultants) per-key pre-opening cost guidance for the property's
> segment and country. Cite the ISHC publication year and the
> segment band used (luxury, upper-upscale, upscale, etc.).
> Multiply by total room count to derive the property total."

**Rationale:** ISHC is the canonical body publishing per-key
pre-opening cost benchmarks segmented by chain scale and geography.
The v5 −36% bias suggests Opus is using an upscale-band per-key
figure ($10–15K/key) rather than the boutique-luxury band
($18–25K/key) — the anchor names the publication and forces the
segment-band citation, leaving the value to be sourced.

### B.4 — `startOccupancy` (−37% bias-down; new ~25%, legacy ~40%)

**Proposed anchor:**

> "`startOccupancy` is the **stabilized-curve starting point at
> month 1 of operations** (single-month value, not a first-quarter
> average). For boutique-luxury new-build openings, reference the
> ramp-curve assumptions in the most recent CBRE or HVS new-build
> hotel forecast methodology, specifically the month-1 occupancy
> assumption distinct from rampMonths and occupancyStep. Cite the
> source and the month-1 figure used."

**Rationale:** v5 −37% bias is consistent across all 20 markets
(σ=4%) — high-confidence definitional misalignment, not a value
disagreement. The new path is averaging over Q1 (~25%) while legacy
correctly uses the month-1 starting point (~40%). The anchor's
first sentence is a **definitional clarification** (not a value
prescription); the sourcing sentence names CBRE / HVS methodology
publications. Definitional wording is permitted under the
mechanism-bug-#2 rule because it disambiguates the field, not its
value.

### B.5 — `catering` (+16% bias-up, σ 30%)

**Proposed anchor:**

> "Express `catering` as the multiplier applied to base F&B revenue
> to derive total F&B (catering + outlets) revenue, following
> USALI 12th edition Schedule 2 (Food & Beverage — Departmental
> Revenue) presentation. For benchmarks, reference STR HOST Almanac
> F&B chapter or CBRE Trends F&B departmental ratios for the
> property's segment and market type (urban, resort, conference).
> Cite the publication and segment band used."

**Rationale:** σ (30%) ≥ |Δ| (16%) — borderline noise. Anchor is
proposed defensively; if v6 confirms σ remains > |Δ| post-anchor,
field gets reclassified to Class 3 (noise floor) rather than
re-anchored further. Naming the publications preserves discipline
even if the bias resolves on its own as a v6 ripple.

### B.6 — `costPropertyTaxes` (−13% bias-down)

**Proposed anchor (lowest-priority — may not need explicit fix):**

> "Estimate `costPropertyTaxes` from the local jurisdiction's
> assessed-value methodology and mill rate, citing the assessor's
> office or state department of revenue source for the jurisdiction.
> Express as an absolute dollar figure derived from
> assessed-value × mill rate, not as a percentage of revenue."

**Rationale:** v5 −13% bias is closest to passing of the 6 fields
(within 7pp of T2's ±20% tolerance). Anchor names the source class
(local assessor / state DOR) and forbids the pct-of-revenue
expression, which is a common Opus shortcut that loses jurisdiction
specificity. Bundle with B.1–B.5 in v6 batch but flag as **expected
to absorb without explicit help** — if v6 shows it passing, retain
the anchor as documentation; if it still misses, escalate to OT-A.6.

### Acceptance for Section B

Each of the 6 anchors above wordsmithed and approved by user; v6
prompt diff prepared (no commit until authorization gate at T+72h);
gate-pass criteria: T2 mid±20% inclusion ≥ 80% per field
post-anchor.

---

## Section C — 4 non-T1 mode-collapsed fields

From `OT-A-3-known-issues.md` v5 result section, four fields ship in
OT-A.4 with uniq < 3 outside the T1 unblock criterion:
  - `costFB` (T2, uniq=2, signed +4.3% ± 3%, bias-up)
  - `costSeg5yrPct` (T3, uniq=2, signed −26.7% ± 7%, bias-down)
  - `svcFeeGeneralMgmt` (T3, uniq=2, signed +3.6% ± 10%, unbiased-noise)
  - `svcFeeTechRes` (T3, uniq=2, signed +5.8% ± 17%, unbiased-noise)

Each gets a Class 1 / Class 2 / defer classification, mirroring the
Q2 analysis that reclassified `svcFeeMarketing` (Class 4 → Class 1)
during the OT-A.4 unblock pass.

### C.1 — `costFB` (T2)

**Classification:** **(a) industry-standard single-value exempt
(Class 1 candidate)**.

**Rationale:** F&B departmental cost ratio for boutique-luxury
properties is genuinely standardized to a narrow band (~28–32%
of F&B revenue per USALI Schedule 2). The +4.3% ± 3% signed Δ
satisfies Class 1's ±10pp criterion, σ ≤ |Δ| is borderline but
unbiased-noise direction tag holds. uniq=2 reflects the operator
contract's standardized cost target, not a missing anchor.

**Action:** Add to `OT-A-3-parity-exemptions.md` Class 1 table
with the same persona-narrowing rationale used for `svcFeeMarketing`.
**No v6 prompt change required.**

### C.2 — `costSeg5yrPct` (T3)

**Classification:** **(b) needs per-market reasoning anchor**
— but with caveat that signed −26.7% bias is the v5 *regression*
from the v3.3 cost-seg fix, suggesting the existing strip-hints
pattern decayed. Investigate whether the OT-A.4 prompt-fingerprint
recompute (`786aae35…`) inadvertently dropped a clause.

**Proposed anchor (only if pre-investigation confirms regression):**

> "Estimate `costSeg5yrPct` as the percentage of depreciable basis
> assigned to MACRS 5-year life, following the IRS Cost
> Segregation Audit Techniques Guide (2022 update) for hotel
> properties. Cite the asset-class table referenced (typically
> furniture, fixtures, decorative lighting, carpeting). Express
> as a percentage of total depreciable basis, not as an absolute
> dollar figure."

**Rationale:** This wording mirrors the v3.3 anchor that originally
worked for cost-seg fields. If the v3.3 wording is intact in the
OT-A.4 prompt, the v5 regression is real and a stronger anchor is
needed. If the v3.3 wording was dropped during the rewrite, restore
it verbatim and the field should re-pass without the proposed
strengthening.

**Pre-v6 work item (no API spend):** diff the OT-A.4 system prompt
against the v3.3 system prompt for the cost-seg block; if the
clause is intact, include the proposed strengthening in v6; if
the clause is missing, restore-only.

### C.3 — `svcFeeGeneralMgmt` (T3)

**Classification:** **(c) insufficient evidence → defer**.

**Rationale:** signed +3.6% ± 10% with `unbiased-noise` direction
tag = the two paths agree within natural per-call spread.
Failure margin on the inclusion gate is small. uniq=2 is a borderline
indicator; with σ > |Δ| the "collapse" may resolve on a v6 rerun
without intervention. Defer to OT-A.6 if v6's other anchors don't
ripple it clear.

**Action:** No v6 anchor change. Watchlist entry in
`OT-A-5-known-issues-followup.md` for post-v6 re-evaluation.

### C.4 — `svcFeeTechRes` (T3)

**Classification:** **(c) insufficient evidence → defer** —
same reasoning as C.3 (signed +5.8% ± 17% with σ > |Δ|, bias gone
per v5 result section).

**Action:** Identical to C.3 — no v6 change; watchlist post-v6.

### Acceptance for Section C

  - C.1 (`costFB`): Class 1 entry drafted in
    `OT-A-3-parity-exemptions.md` for review (no v6 spend).
  - C.2 (`costSeg5yrPct`): prompt diff completed; v6 includes
    either restoration or strengthening per diff outcome.
  - C.3 / C.4 (`svcFeeGeneralMgmt`, `svcFeeTechRes`): watchlist
    entries in follow-up doc; no v6 change.

---

## v6 batch summary (single $22 rerun, post-authorization)

| Field | Section | Action | Anchor wording change? |
|---|---|---|---|
| `inflationRate` | A | Q1 re-verify against v5 raw; outcome dictates anchor inclusion | Conditional (only if STAYS branch) |
| `costHousekeeping` | B.1 | New anchor | YES — STR HOST / CBRE source pointer |
| `costMarketing` | B.2 | New anchor | YES — USALI Schedule 5 + branded distinction |
| `preOpeningCosts` | B.3 | New anchor | YES — ISHC per-key source pointer |
| `startOccupancy` | B.4 | Definitional + new anchor | YES — month-1 clarification + CBRE/HVS pointer |
| `catering` | B.5 | Defensive anchor | YES — STR HOST F&B pointer |
| `costPropertyTaxes` | B.6 | Defensive anchor | YES — assessor / DOR pointer |
| `costFB` | C.1 | Class 1 reclassification (docs only) | NO |
| `costSeg5yrPct` | C.2 | Diff vs v3.3; restore or strengthen | YES (TBD by diff) |
| `svcFeeGeneralMgmt` | C.3 | Defer to watchlist | NO |
| `svcFeeTechRes` | C.4 | Defer to watchlist | NO |

**Estimated prompt LOC added:** ~120–160 (six new anchors of ~20 LOC
each, plus ~10–30 LOC for inflationRate if Section A → STAYS).

**v6 gate-pass criteria:**
  - T1 ≥ 7/8 raw OR ≥ 7/8 exemption-adjusted (do not regress
    from OT-A.4 baseline).
  - T2 ≥ 13/17 PASS (current OT-A.4 baseline 8/17 + 5 of 6 B.x
    anchors landing).
  - 0 mode-collapsed outside Class 1 exemptions.
  - Schema 100%; voice 0; latency ≤ 2× legacy.

If any gate fails: pause; do not commit prompt changes; analyze
which anchor failed and re-design before any further spend.

---

## Out-of-scope for OT-A.5 (parking)

  - Sub-string-path NaN-coercion latent bug in `extractGuidance`
    affecting `adrGrowth`, `occupancyStep`, `ltv`, `inflationRate`,
    `rampMonths` — this is a downstream consumer bug, orthogonal to
    anchor design. File for OT-B (downstream-extractor hardening).
  - Bimodal language for `incentiveFee` (D5 carry-over). Re-evaluate
    post-OT-A.5 only if v6 results suggest the 1-unique-range
    Class 1 exemption is masking a real bias.
  - `costSeg15yrPct` and `svcFeeAccounting` (T3 watchlist entries
    from `OT-A-3-known-issues.md`). Re-evaluate post-OT-A.5 ripple.
