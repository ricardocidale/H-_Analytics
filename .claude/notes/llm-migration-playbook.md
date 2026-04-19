# LLM-Migration Playbook

**Type:** Note (narrative reference), not a rule. Rules enforce; notes teach.
**Authority:** The four rules below are binding; this note weaves them into one readable story for the next engineer who has to migrate an LLM pipeline.
**Audience:** Whoever starts the next LLM pipeline migration — whether it's swapping Opus for the next Anthropic model, adding Braintrust (OT-C), introducing the verdict cache layer (ADR-004 Phase 5), or a migration we haven't thought of yet.

---

## Why this note exists

In April 2026 we migrated the Cognitive Engine's synthesis path from a custom JSON-parsing + regex-extraction pipeline to Vercel AI SDK `streamObject` with Zod-validated output. The migration arc was OT-A.1 → OT-A.5. It ultimately shipped clean, but it took **five A/B iterations, ~$66 of LLM spend, and surfaced four distinct classes of mechanism bug** we had not anticipated up front.

Each mechanism bug is now codified as a binding rule. But rules alone don't teach the *pattern* — they enforce it. This note is the pattern.

**The pattern in one sentence:** LLM-pipeline migrations fail at four different places — semantic contract, prompt grounding, output shape, and baseline accuracy — and every one of those failures looks like "the new path is worse" when the real issue is something else entirely.

---

## The four mechanism bugs

Each has a rule enforcing detection + a playbook for remediation. The order matters: #1 is the easiest to diagnose, #4 is the hardest.

### #1 — Definition drift

**Mechanism.** Old path and new path disagree on what a field means. Different units (`$` vs `%`), different denominators (of total revenue vs of room revenue), different scopes (per-step vs cumulative). Old path's parsing baked in one interpretation; new path's prompt lets the LLM free-interpret.

**Symptom.** Per-field bucket-match wildly varies. New path has high internal consistency (same definition emitted across all inputs) but agrees with old path only on fields where the interpretation happens to line up.

**Diagnostic.** Compare specific field outputs between paths on cases you understand. If old says `0.15` (15%) and new says `150000` (dollars), the problem is definitional.

**Remediation.** Inject an explicit unit/denominator/scope contract into the new prompt. We call ours `FIELD_DEFINITIONS` (in `server/ai/synthesis-schema.ts`). Each field gets: canonical key, unit symbol, denominator or scope description, reasoning cue (not a value range — see #2). When a field's interpretation is ambiguous, the contract names which interpretation industry practice uses, not textbook USALI.

**Rule:** The contract is enforced by shape (Zod + `z.enum(CANONICAL_RESEARCH_FIELDS)`). Adding a new canonical field requires updating the enum, the definitions, and downstream consumers atomically.

**Related:** `.claude/skills/analyst/contracts.md`, `server/ai/synthesis-schema.ts`.

### #2 — Mode collapse

**Mechanism.** The prompt includes "typical X–Y%" hints for grounding. The LLM reads those hints as strict prescriptions, not calibration aids. Result: the LLM emits the hint value *verbatim* for every input, regardless of how different the inputs actually are. Aspen and Outer Banks get identical ramp curves. Per-market intelligence disappears; per-input variation collapses to 1 unique value.

**Symptom.** Bucket-match rate rises dramatically (because both paths happen to be in range of the hint). But per-input unique-range count on that field collapses to 1 across N diverse markets. The gain is prescription, not reasoning.

**Diagnostic.** For every field, count distinct `(low, mid, high)` tuples across your test set. If `uniq = 1` across 20 markets, mode collapse.

**Remediation.** Strip typical-range hints from the field definitions. Replace with per-market reasoning cues naming *evidence sources* (STR HOST Almanac, CBRE Trends, ISHC per-key guidance, IRS Cost Segregation ATG, jurisdiction millage, etc.) — the prompt tells the LLM *where to look*, not *what answer to find*. Add an explicit anti-collapse rule in the system prompt: "materially different markets MUST produce materially different numbers on rate-sensitive fields."

**Rule:** `.claude/rules/field-definitions-no-prescription-hints.md` + `tests/proof/field-definitions-no-hints.test.ts`. Patterns like `/typical\s+\d/i` or `/e\.g\.,?\s+\d[–\-]\d/i` are banned. The proof test blocks `verify:summary`.

**Edge case.** Some fields are genuinely industry-standardized to one value (e.g., branded-operator management fee at ~10% of GOP). `uniq = 1` on those is correct behavior, not a bug. These get a Class 1 parity exemption (see #4). Do not add hints to "help" them.

### #3 — Representational mismatch

**Mechanism.** Old path and new path emit *fundamentally different evidence shapes by design*. Old emits point estimates ("9% incentive fee"); new emits ranges ("8–12% with midpoint 10%"). Both are defensible outputs for their respective contracts. But any width-aware parity test diverges by construction on the fields where shapes differ.

**Symptom.** Raw parity gate (severity-equality, action-equality, range-overlap) returns a mathematical floor regardless of which adapter you use to bridge shapes. In our arc: 13.6% severity match, 13.6% action match, 6% range overlap — locked floor values driven by the cases where legacy's point happened to equal new's midpoint AND new's range was tight.

**Diagnostic.** Build the adapter. Run the parity gate. If the result is a suspiciously round floor with no obvious field responsible — and no tweak moves the needle — you're not in a tunable failure, you're in a structural one.

**Remediation.** You cannot raw-parity-test two fundamentally different contracts. Test at the *downstream-effect layer* instead: what does the consumer of the output actually *do* with it? If a user takes action on legacy's "9%" and new's "8–12% mid 10%," do they make the same decision? That's the question your gate must answer. Midpoint agreement within a tolerance, range inclusion, verdict severity match — these are downstream-effect metrics. Raw shape-for-shape is the wrong layer.

**Rule:** `.claude/rules/llm-contract-migration-parity.md`. Requires declaring at PR time whether the migration is shape-compatible (raw parity valid) or shape-diverging (downstream-effect parity required). Shape mismatches require an adapter and tier-specific tolerances.

**Related artifacts:** `docs/operational-tooling/OT-A-3-path3-respec.md`, `docs/operational-tooling/OT-A-3-field-tiering.md`.

### #4 — Parity-against-broken-baseline

**Mechanism.** Old path itself is inaccurate on some fields. Its output doesn't reflect reality — maybe it hard-codes a stale constant, maybe its regex extracts the wrong slice of the LLM response, maybe the upstream panel that feeds it had always been mis-prompted. The new path diverges because it's *more accurate*, not because it regressed. Parity measures divergence-from-wrong.

**Symptom.** A field fails the downstream-effect parity gate with directional bias (not noise) and the new path's variance aligns with external ground truth better than legacy does. Checking legacy's code path reveals a baseline you wouldn't accept if you saw it fresh.

**Diagnostic.** Before exempting a field as "legacy-inaccurate," *read the legacy code path*. Not just the extractor — the whole upstream chain that produces the baseline. Verify the wrong-baseline claim with cited evidence (legacy emits `X` because `file:line` does `Y`, and `Y` is wrong because the reality is `Z`). If verification holds, exempt. If verification fails or is ambiguous, do NOT exempt — misclassifying here ships a silent regression.

**Remediation.** Exempt the field from parity measurement for this migration. Document the legacy-vs-truth divergence. The new path's output becomes the authoritative baseline going forward. Future migrations parity-test against the new baseline.

**Rule:** `.claude/rules/parity-exemption-classes.md` — four-class exemption taxonomy (industry-standard single-value / legacy-inaccurate / stochastic noise floor / under-reasoned). Each class has strict qualification bars. Class 2 ("legacy-inaccurate") specifically requires verified legacy code review — claim without verification → downgrade to Class 4 ("under-reasoned") pending investigation.

**Trap.** The test-set composition matters. In OT-A.3, all 20 v5 cases were US markets. Our Q1 re-verification protocol asked "does legacy pick country-matching CPI?" — but with no country variation in the test set, the question couldn't be answered. Always design multi-jurisdiction test coverage when testing jurisdiction-sensitive fields, otherwise you cannot distinguish Class 2 from Class 4.

**Related artifacts:** `docs/operational-tooling/OT-A-3-parity-exemptions.md`, `docs/operational-tooling/OT-A-5-section-a-crosscheck.md`.

---

## The escalation that produces all four

A migration rarely stops at one mechanism bug. Ours escalated through all four in sequence:

| Iteration | What failed | Which mechanism |
|---|---|---|
| v1→v2 | landValue in `$` vs `%` | #1 definition drift |
| v2→v3 | "typical X-Y%" hints → identical ramp curves across 20 markets | #2 mode collapse |
| Path 3 | severity 13.6%, locked floor regardless of adapter | #3 representational mismatch |
| Q1 re-verify | inflationRate "legacy-inaccurate" claim couldn't be verified without multi-country test data | #4 parity-against-broken-baseline |

**Pattern:** Each iteration's fix uncovers the next layer. There is no shortcut to skipping the middle iterations — every mechanism manifests only after the previous one is resolved. Plan for four, not one.

---

## Pre-flight checklist for the next migration

Before you authorize your first $ of rerun spend:

1. **Declare the shape relationship** between old and new paths in the migration planning doc:
   - Shape-compatible (same fields, same units, same cardinality) → raw parity valid, use bucket-match.
   - Shape-diverging (new adds ranges, enums, new fields, or changes output type) → downstream-effect parity required from the start. Never plan raw parity on a shape-diverging migration.

2. **Write the field-level contract first.** Canonical field enum (or equivalent). Unit + denominator + scope per field. This is what catches mechanism bug #1 before any rerun fires.

3. **Tier the fields by NPV-material impact.** Not every field matters equally. T1 foundational drivers (ADR, occupancy, cap rate, LTV, incentive fee, ADR growth, inflation, interest) get strict gates. T2/T3 progressively looser. This prevents "one noisy T3 field fails the whole gate" dramatics.

4. **Test-set composition audit.** Is the test set diverse enough to detect the mechanism bugs you're testing for?
   - For jurisdiction-sensitive fields: multi-country coverage.
   - For operator-brand-sensitive fields: branded + independent coverage.
   - For segment-sensitive fields: luxury + upscale + midscale coverage.
   - If the test set lacks the diversity a gate needs, either expand the test set or don't claim the gate tests what it can't.

5. **Offline evaluation before API spend.** A/B parity math is a deterministic transform of existing raw outputs. You can re-spec a gate, re-classify exemptions, and re-evaluate without a single new LLM call. Most of our post-v4 work was offline. Do the cheap thinking before the expensive sampling.

6. **Per-field direction-of-failure reporting.** When a field fails, report signed mean delta + standard deviation. Systematic bias is a different animal than unbiased noise. The gate's diagnostic output should make the distinction automatic; don't treat "FAIL" as binary.

7. **Observation window before the next migration change.** When a migration ships, give it production time before layering more changes on. Committing a fix during an observation window is indistinguishable from regression in post-hoc analysis. We adopted a 72-hour default for the OT-A.4 flip; longer for higher-risk migrations.

---

## What to do when you get stuck

If you're three iterations in and nothing is converging:

1. **Stop spending.** Per-iteration LLM spend compounds fast, and iterations without a diagnosis are just expensive noise-generation.
2. **Go offline.** Use the existing raw outputs to answer more questions than the gate answers. Per-field unique-range counts, histograms, legacy vs new stats, test-set composition — all free.
3. **Suspect the gate, not the output.** Most commonly, you're measuring the wrong thing. Three of the four mechanism bugs above manifest as "the new path is worse" when the real fix is "the gate was wrong." Question the gate.
4. **Read legacy source.** Whatever you think legacy does, confirm by reading the code path. Inferring legacy behavior from its output is how mechanism bug #4 hides — you can't see the hard-coded constant without opening the file.
5. **Write a BLOCKED.md sibling to the active handoff.** Document what doesn't fit. Don't improvise a workaround that papers over structural issues. The BLOCKED → RESOLVED trail is the audit record; silent improvisation is how post-facto investigations get expensive.

---

## The "am I done?" checklist

A migration is ready to ship when:

- **Shape relationship is declared** and the appropriate parity layer (raw vs downstream-effect) is used.
- **Field-level contract is in code** (Zod or equivalent) and the proof test against it passes.
- **Tiered gate passes with per-field evidence** — including exemption classes for fields that don't apply (Class 1/2/3 with qualification bars met and documented; Class 4 either fixed or explicitly deferred with a design spec).
- **Direction-of-failure reporting** on any miss distinguishes bias from noise.
- **Observation window cleared** post-ship — Sentry clean, user reports clean, no silent data-quality regressions detected.
- **ENGINE_VERSION bumped** (if the migration is part of a cached system) so cache invalidation is atomic with the ship.
- **Rules that enforce the mechanism bugs you hit** are either already in place or you're landing them with your ship.

If any of these are missing, you're not done. Keep going.

---

## Related

### Rules (enforceable)
- `.claude/rules/field-definitions-no-prescription-hints.md` — mechanism bug #2
- `.claude/rules/llm-contract-migration-parity.md` — mechanism bug #3
- `.claude/rules/parity-exemption-classes.md` — mechanism bug #4 (taxonomy)
- `.claude/rules/analyst-verdict-contract.md` — downstream-effect contract

### Precedent artifacts (narrative + data)
- `docs/operational-tooling/OT-A-3-ab-results.md` — v1→v4 iteration log
- `docs/operational-tooling/BLOCKED-ota3-path3.md` — mechanism bug #3 incident writeup
- `docs/operational-tooling/OT-A-3-parity-exemptions.md` — exemption framework + Q1/Q2 record
- `docs/operational-tooling/OT-A-3-field-tiering.md` — tiering template
- `docs/operational-tooling/OT-A-3-path3-respec.md` — re-spec example
- `docs/operational-tooling/OT-A-5-design.md` — anchor-proposal template
- `docs/operational-tooling/OT-A-5-section-a-crosscheck.md` — Class 4 vs Class 3 example (test-set composition gap)

### Tooling
- `server/ai/engine-version.ts` + `tests/proof/engine-version-drift.test.ts` — fingerprint-driven ENGINE_VERSION discipline
- `tests/proof/field-definitions-no-hints.test.ts` — mechanism bug #2 enforcement at CI time
- `tests/ai/orchestrator-fallback.test.ts` — fallback-behavior contract (prevents silent degradation masquerading as success)

### For the next migration
- `.claude/skills/analyst/contracts.md` — Analyst contract atlas (updated post-OT-A.4)
- `.claude/skills/analyst/cognitive-engine.md` — Engine usage rules
- `.claude/rules/agent-collision-hygiene.md` — avoid the attribution mess when two agents work the same migration
