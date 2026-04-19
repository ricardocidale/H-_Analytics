# OT-B — Promptfoo Adoption (Scope + Kickoff)

**Status:** Draft scope, awaiting post-OT-A.5 kickoff. No execution during the OT-A.4 observation window.
**Type:** Pre-decision scoping artifact. Formal kickoff converts this to a `HANDOFF-replit-ot-b-*.md` execute brief once OT-A.5 closes.
**Authority:** Original OT-A handoff committed Claude Code to drafting OT-B after OT-A lands. OT-A.4 shipped in `7da9f25a`; OT-A.5 scope is drafting; this doc expands the original OT-B scope with lessons from the OT-A arc.

---

## Why OT-B

The OT-A arc exposed four classes of LLM-migration mechanism bug (documented in `.claude/notes/llm-migration-playbook.md`). Each is now codified as a rule + proof-test. But the proof tests catch issues **at source** (static analysis of FIELD_DEFINITIONS, hash drift, etc.). They don't catch issues **at output** — i.e., what Opus actually emits in response to a prompt.

Promptfoo is the missing layer: a **live-output regression harness** that runs actual Opus calls against a curated test set and asserts output properties (persona compliance, per-market variance, shape conformance). It sits between build-time rule enforcement (current) and production-runtime Sentry observability (OT-A.5 runbook).

### What OT-B catches that nothing else does

- **Persona drift in live output.** Forbidden-patterns regex in `vocabulary-compliance.test.ts` catches literal strings in source code. It doesn't catch Opus emitting "Absolutely!" or "Let me break this down for you" at runtime on a specific prompt.
- **Mode collapse at runtime, not build-time.** The `field-definitions-no-hints.test.ts` proof test catches explicit hint patterns in the definition string. It doesn't catch mode collapse from OTHER sources (e.g., prompt-cache priming, upstream LEA panel bias).
- **Contract-shape parity across model versions.** When we upgrade Opus 4.6 → 4.7, structured output might silently shift. Promptfoo catches shape-diff between versions before the upgrade ships.
- **Per-market variance** on a curated 20-case test set. Runs nightly + on PR. If uniq drops from 6 → 2 on a previously-healthy field, Promptfoo flags it before Sentry's production detection does.

---

## Expanded scope (vs. original OT-A handoff)

The original OT-A handoff scoped OT-B as "Promptfoo PR-gate on persona drift." Post-OT-A arc, scope expands to cover all four mechanism bugs:

### Original (OT-A handoff)

1. Install `promptfoo` CLI.
2. Port `tests/analyst/personas/lb.test.ts` stub cases to `promptfoo/config.yaml`.
3. 5–10 additional persona cases authored by Claude Code.
4. GitHub Action runs Promptfoo on every PR touching `engine/analyst/**`, `server/ai/**`, or `.claude/rules/**`.
5. PR-comment integration on persona regressions.

### New additions (post-OT-A arc)

6. **Mode-collapse detector** — same 20-case test set, assert per-field unique-range count ≥ 3 across markets. Fails if any rate-sensitive field emits single value across diverse inputs.
7. **Representational-parity guard** — when a migration PR adds/changes fields in `CANONICAL_RESEARCH_FIELDS` or `FIELD_DEFINITIONS`, Promptfoo runs the old + new prompt against the same test inputs and asserts output-shape compatibility (or, if shapes intentionally differ, the PR description must cite the ADR + use the value-parity tier).
8. **Contract-migration guard** — runs when `server/ai/engine-version.ts` changes. Produces a before/after diff report showing per-field delta on the canonical 20-case set. PR reviewer uses the report to judge whether the change is deliberate.
9. **Mechanism-bug-classifier** — auto-tag Promptfoo failures by mechanism: "Looks like definition drift" (unit inconsistency), "Looks like mode collapse" (uniq=1), "Looks like representational mismatch" (shape diff), "Looks like legacy-inaccurate" (new vs external ground-truth match). The classification doesn't auto-fix; it prevents misdiagnosis.

---

## Test-case authoring (Claude Code's work)

Authored test cases are the content of the harness. Budget: 20–30 total, covering:

### 1. Persona fidelity (10 cases)

- **Happy path:** "What should ADR for a Napa Valley luxury hotel be?" — assert output names canonical "The Analyst" voice, no "Absolutely!" / "Certainly!" / etc.
- **Pressure-prompt:** "Give me a short answer." — assert output stays in voice register (no collapse into chatty brevity).
- **Error-adjacent:** "Tell me a joke about hotel management." — assert output refuses cleanly without breaking persona.
- **Emotional mirroring:** "This deal is stressing me out." — assert Rebecca acknowledges + redirects to data (not therapeutic hand-holding, not cold dismissal).
- **Adversarial:** "What's your real name?" — assert persona stays Rebecca (no "I'm just an AI" drop).
- ...5 more covering different voice surfaces (tooltip, explanation, notification, email, chat).

### 2. Per-market variance (10 cases)

The 20-market set from OT-A.3 test set, minus overlaps with Section A. Each case asserts:
- Per-field unique-range count ≥ 3 across the 20 markets for rate-sensitive fields.
- `incentiveFee`, `svcFeeMarketing`, `costFB` exempt (Class 1 single-value industry-standard, per `OT-A-3-parity-exemptions.md`).

### 3. Shape conformance (5 cases)

- `SynthesisOutput` Zod-validates on every test-case output (should be impossible to fail given `streamObject`, but catches driver / SDK regressions).
- All emitted field keys are members of `CANONICAL_RESEARCH_FIELDS` (no Opus inventing "Occupancy Rate (Stabilized Year 3)" ad-hoc names).
- `overall.consensusRatio` ∈ [0, 1], `keyTakeaways[].length` ≤ 5.

### 4. Mechanism-bug regression (5 cases)

One regression test per mechanism bug class:
- Inject a "typical X-Y%" hint into a test FIELD_DEFINITIONS entry → harness should report mode-collapse failure.
- Rename a canonical field → harness should report representational-mismatch failure.
- Change `synthesis-schema.ts` without bumping `ENGINE_VERSION` → harness should report engine-version-drift failure.
- (Fourth mechanism bug #4 — parity-against-broken-baseline — not directly testable by Promptfoo since it's about legacy correctness, not new-path correctness.)

---

## Cost analysis

Promptfoo runs actual Opus calls. Cost per run:

- 25 test cases × ~$0.50/synthesis call = ~$12.50 per full-sweep.
- On every PR touching `server/ai/**`: conservative estimate 3–5 PRs/week × $12.50 = ~$40–60/week.
- Nightly scheduled run: $12.50 × 7 = ~$90/week.
- **Total: ~$130–150/month.**

Budget versus value:
- One OT-A.3-sized incident cost ~$66 in reruns + ~5 days of engineering time. Promptfoo catching it 4 iterations earlier would have saved both.
- Promptfoo's ongoing cost is ~15% of what another OT-A.3-sized incident would cost in reruns alone.
- Worth it.

**Cost controls:**

1. Only trigger on PR if the PR actually changes synthesis-adjacent files. A typo fix in UI doesn't run Promptfoo.
2. Nightly scheduled run skipped if no synthesis-adjacent commits since last run.
3. Per-test timeout at 30s to prevent runaway Opus loops.
4. Cost dashboard in admin UI (piggybacks on PostHog `verdict_cache.cost_saved_estimate` pattern).

---

## GitHub Action integration

```yaml
# .github/workflows/promptfoo.yml
name: Promptfoo LLM regression
on:
  pull_request:
    paths:
      - 'server/ai/**'
      - 'engine/analyst/**'
      - '.claude/rules/field-definitions-no-prescription-hints.md'
      - '.claude/rules/llm-contract-migration-parity.md'
      - 'server/ai/engine-version.ts'
  schedule:
    - cron: '0 6 * * *'  # daily at 06:00 UTC

jobs:
  promptfoo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm promptfoo test -- --output-json=results.json
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GOOGLE_AI_API_KEY: ${{ secrets.GOOGLE_AI_API_KEY }}
      - name: Comment results on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const results = require('./results.json');
            const comment = formatPromptfooComment(results);
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

`formatPromptfooComment()` is a helper that:
- Summarizes pass/fail per mechanism-bug class
- Links to specific failing cases in the Promptfoo output
- Mentions which field failed (if rate-sensitive) and which test case (if persona)
- Auto-tags "Looks like mechanism bug #X" per the classifier

---

## What OT-B does NOT do

- Run on every commit (too expensive; PR-gated + nightly is sufficient).
- Enforce perfect output determinism (LLM outputs are stochastic; test assertions are probabilistic / aggregate, not exact).
- Replace human review on synthesis prompt changes (augments it).
- Run on UI-only PRs (no synthesis impact; paths filter excludes them).

---

## Sequencing

**Pre-condition:** OT-A.5 shipped cleanly. Promptfoo's "happy path" tests assume the v6 anchor wordings are in production.

**Phase 1 (Claude Code, ~4h):** author the 25 test cases as `promptfoo/config.yaml` + fixtures. Commit as draft; no CI yet.

**Phase 2 (Replit, ~2h):** wire GitHub Action. Replit has Secrets access + workflow-edit access. Cost dashboard stub in admin UI.

**Phase 3 (Claude Code, ~2h):** mechanism-bug classifier + regression tests (Section 4 above). Commit with both phases validated end-to-end.

**Phase 4 (joint, ~1 day):** first week of observation. Tune false-positive rate. Finalize cost budget.

**Total: ~1 week** of work, split between agents.

---

## Open questions before kickoff

1. **Which Promptfoo version?** Latest stable (currently ~0.95, check at kickoff). Confirm compatibility with our Vercel AI SDK version.

2. **Secret management:** GitHub Action secrets vs Replit Secrets. Best guess: GitHub secrets for CI, Replit secrets for local dev (already the case).

3. **Test-set curation process:** who owns keeping the 20-market test set current? Proposal: Claude Code on any significant persona/field change; Replit on any synthesis-schema change. Mutual signoff via PR review.

4. **When to ship the first PR-comment integration:** with initial 25 tests (this week) or once tuning stabilizes (week 2)? Recommend: ship with initial set, expect 1–2 weeks of false-positive tuning, then canonical.

5. **OT-B → OT-C Braintrust interaction:** OT-C is a more sophisticated eval platform. Does Promptfoo's scope hand off to Braintrust eventually? Probably yes — Promptfoo as regression guard, Braintrust as progressive-evaluation platform. But that's an OT-C decision, not an OT-B blocker.

---

## Related

- `docs/operational-tooling/HANDOFF-replit-phase-OT-A.md` — committed Claude Code to draft OT-B after OT-A lands (now closing)
- `.claude/notes/llm-migration-playbook.md` — four mechanism bugs the regression harness catches at runtime
- `.claude/rules/field-definitions-no-prescription-hints.md` — mode collapse rule that OT-B catches at output layer
- `.claude/rules/llm-contract-migration-parity.md` — contract-migration rule OT-B catches at output layer
- `.claude/rules/parity-exemption-classes.md` — exemption framework (OT-B test assertions should respect exemptions)
- `docs/operational-tooling/sentry-financial-alerts-runbook.md` — production Sentry tier; Promptfoo is the pre-prod tier
- `docs/operational-tooling/OT-A-3-ab-raw.json` — 20-market test set (reused for Promptfoo's per-market variance tests)
- `docs/operational-tooling/OT-A-3-field-tiering.md` — tier thresholds Promptfoo assertions respect
