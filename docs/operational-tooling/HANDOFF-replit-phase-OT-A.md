# Handoff: Phase OT-A — Vercel AI SDK + AI Gateway Adoption

**From:** Claude Code
**To:** Replit Agent
**Date:** 2026-04-19
**Track:** Operational Tooling (parallel to Analyst Architecture Phases 3b+)
**Why this is a handoff:** This phase edits runtime code in `server/ai/` — per `.claude/rules/claude-replit-split.md`, that's your domain. Claude Code owns the plan, the Zod schema design, and the verification rubric; you own the package installs, the runtime refactor, the A/B comparison, and the final deletion of the old code path.

---

## Context

**Why this is happening:**
- The user has a Vercel account, which unlocks AI Gateway as a zero-markup LLM proxy with native observability and automatic failover.
- Adopting it collapses what would have been two separate phases (Helicone for observability + Vercel AI SDK for structured output) into one coherent migration with one vendor relationship.
- Expected outcome: ~150-200 lines of custom LLM plumbing deleted, unified cost/usage dashboard in Vercel, provider failover for free, and Anthropic native prompt caching cutting synthesis input-token costs by 50-90% on repeat calls.

**Relationship to Phase 3b (the Specialist backfill):**
- OT-A does NOT block Phase 3b. Phase 3b is free to start in parallel.
- If Phase 3b lands first, it uses the existing `getAnthropicClient()` / `getGeminiClient()` clients. That's fine — OT-A migrates those clients out from under Phase 3b's feet without changing the Specialist surface.
- If OT-A lands first, Phase 3b's new `funding-specialist.ts` and `revenue-specialist.ts` can adopt the new SDK-based clients from day one. Cleaner, but not required.
- **No file is touched by both phases** — OT-A stays in `server/ai/` plumbing; Phase 3b operates in `engine/analyst/surface/mgmt-co/` and `server/routes/`.

**Track naming:** "OT" stands for Operational Tooling. This is the first of three OT phases:
- **OT-A** — this handoff (Weeks 1-2)
- **OT-B** — Promptfoo CI gate (Weeks 3-4; separate handoff)
- **OT-C** — Braintrust decision point (Week 7; no execution, just a decision)

---

## Mandatory pre-flight reading (in this order)

1. `docs/operational-tooling/PLAN-operational-tooling.md` (next file I'll write — the overall roadmap for this track)
2. `.claude/rules/pre-commit-verification.md` — the blocking five gates
3. `.claude/rules/cross-check-invariants.md` — edit → sibling-surface map (schema/seed/manual parallel updates)
4. `server/ai/clients.ts` — what you're refactoring (96 lines today)
5. `server/ai/research-orchestrator.ts` — specifically lines 372-396 (the synthesis call you'll migrate)
6. `server/ai/research-value-extractor.ts` — what may be deleted in sub-task 4 (195 lines)
7. `engine/analyst/contracts/verdict.ts` — the Zod shape `SynthesisOutputSchema` will build on (existing work from Phase 3a)
8. [Vercel AI Gateway docs](https://vercel.com/docs/ai-gateway) — integration patterns
9. [Vercel AI SDK `generateObject` / `streamObject` docs](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) — the structured-output API
10. [Anthropic prompt caching via Vercel AI SDK](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic#cache-control) — native caching reference
11. `.claude/skills/analyst/cognitive-engine.md` — reminder: Specialists NEVER import `research-orchestrator.ts` directly; they go through the façade. OT-A does not change this rule.

---

## Sub-task OT-A.1 — Anthropic native prompt caching (quick win)

### Scope

**Do this first.** It's ~10 lines of change, no package installs, no feature flag, no migration risk. Unlocks immediate cost savings via Anthropic's native prompt caching API.

### Why first

Claude Code's open question #1 in `.claude/notes/analyst-architecture.md` flags that ten clicks on the same property = ten full Opus synthesis runs. Native prompt caching on the synthesis system prompt means only the FIRST call in a 5-minute window pays for the full input; subsequent calls read cached tokens at ~10% of the cost.

This benefit exists regardless of the broader SDK migration. Ship it immediately.

### Change

In `server/ai/research-orchestrator.ts` around lines 382-387, the synthesis call currently passes `system` as a plain string. Anthropic supports a structured-block system parameter where individual blocks can carry `cache_control: { type: "ephemeral" }`.

Pseudocode:

```ts
const stream = anthropic.messages.stream({
  model:      SYNTHESIS_MODEL,
  max_tokens: SYNTHESIS_TOKENS,
  system: [
    { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }
  ],
  messages: [{ role: "user", content: userPrompt }],
});
```

Apply the same pattern to the two panel calls in `runAnalystPanel` (look for the `anthropic.messages.stream` call in the Panel B path — Gemini has its own separate native caching API which is out of scope for A.1).

### Verification

After the change, add telemetry (console.debug under a `DEBUG_AI_CACHING` env var) that logs `response.usage.cache_creation_input_tokens` and `response.usage.cache_read_input_tokens` from the final message. On the second call with the same system prompt within 5 minutes, `cache_read_input_tokens` should be > 0.

**Rollback:** one revert commit. No data migration.

---

## Sub-task OT-A.2 — Install Vercel AI SDK + Gateway plumbing

### Scope

Install packages. Wire a new unified client. Do NOT migrate any call sites yet — old clients keep working.

### Packages to install

```bash
npm install ai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/openai
```

### Secrets to add (Replit Secrets)

- `AI_GATEWAY_API_KEY` — obtain from the user's Vercel dashboard → AI Gateway section

### New file: `server/ai/ai-sdk-clients.ts`

A thin wrapper that mirrors the existing singleton pattern but uses the Vercel AI SDK provider factories routed through Gateway. Key requirements:

1. **BYOK configuration:** Gateway accepts existing provider API keys via header, so your existing `ANTHROPIC_API_KEY` / `AI_INTEGRATIONS_OPENAI_API_KEY` etc. continue to be used. Zero markup on your existing provider billing.
2. **Unified model IDs:** `anthropic/claude-opus-4-6`, `google/gemini-2.5-flash`, `openai/gpt-5.4` (format per Gateway docs).
3. **Singleton factories:** `getAiSdkAnthropic()`, `getAiSdkGoogle()`, `getAiSdkOpenAI()` returning the Vercel AI SDK's `LanguageModelV1` interface.
4. **Fall-back ergonomics:** if `AI_GATEWAY_API_KEY` is absent, throw a clear error on first use.

### What does NOT change in OT-A.2

- `server/ai/clients.ts` — the existing OpenAI/Anthropic/Gemini singletons KEEP working. Both paths coexist.
- `server/ai/research-orchestrator.ts` — no call site changes yet.
- `server/ai/research-value-extractor.ts` — untouched.
- All Specialists, routes, tests — untouched.

### Commit message

> `audit OT-A.2: install Vercel AI SDK + AI Gateway client wrapper`
>
> `Adds @ai-sdk/* packages and a new server/ai/ai-sdk-clients.ts wrapper`
> `that routes through AI Gateway with BYOK. No existing call sites`
> `changed — both old and new clients coexist. OT-A.3 will migrate the`
> `synthesis call behind a feature flag.`
>
> `Surfaces: S8 (AI plumbing)`

### Verification for OT-A.2

All five gates pass. The new wrapper is imported by a throwaway test file in `tests/ai/ai-sdk-client.smoke.test.ts` that makes ONE Gemini Flash call ("What's 2+2?") to prove end-to-end connectivity. Delete the smoke test when OT-A.3 lands.

---

## Sub-task OT-A.3 — Migrate synthesis call behind feature flag

### Scope

Put the Opus synthesis step behind a parallel code path controlled by the `USE_AI_SDK_SYNTHESIS` env var (default: `false`). Run both paths in A/B mode for 1 week.

### Schema to add (Claude Code's responsibility — will be added to this handoff as an amendment before you start)

`SynthesisOutputSchema` — the Zod schema defining the shape of synthesis output. Will live in `engine/analyst/cognitive/synthesis-schema.ts`. It must match what `research-value-extractor.ts` currently extracts, so A.4 (extractor deletion) is mechanical if A.3 succeeds.

**I will provide this schema before you start OT-A.3.** Do NOT invent it.

### Change in `server/ai/research-orchestrator.ts`

Replace the current streaming synthesis block (lines 380-396 approximately) with a branch:

```ts
if (process.env.USE_AI_SDK_SYNTHESIS === "true") {
  // New path: streamObject via AI Gateway
  const { partialObjectStream, object: finalObjectPromise } = streamObject({
    model: getAiSdkAnthropic()("claude-opus-4-6"),
    schema: SynthesisOutputSchema,
    system: [{ type: "text", text: systemPrompt, experimental_providerMetadata: { anthropic: { cacheControl: { type: "ephemeral" } } } }],
    prompt: userPrompt,
    maxTokens: SYNTHESIS_TOKENS,
  });

  for await (const partial of partialObjectStream) {
    // Emit SSE events mirroring the old text-delta shape for UI compatibility
    yield { type: "content", data: JSON.stringify(partial) };
  }
  fullContent = JSON.stringify(await finalObjectPromise);
} else {
  // Existing path (unchanged)
  const anthropic = getAnthropicClient();
  const stream = anthropic.messages.stream({ ... });
  // ... existing logic
}
```

Important: the SSE event shape (`type: "content"`) must stay compatible with what the client expects. If you need to change the shape, flag it BLOCKED — the client is out of OT-A scope.

### A/B measurement plan

Run both paths in parallel over ~20 real research requests. For each request:

1. Invoke the old path (flag off). Capture `fullContent` + `durationMs`.
2. Invoke the new path (flag on). Capture `fullContent` + `durationMs`.
3. Compare the resulting `AnalystVerdict` (or the extractor's output) field-by-field.

### Parity criteria (must meet ALL to proceed to A.4)

- **Severity match rate ≥ 95%** across the 20 runs
- **Numeric range midpoints within ±5%** on shared fields
- **No invariant failure:** `buildAnalystVerdict()` succeeds on both paths
- **Voice check:** `FORBIDDEN_VOICE_PATTERNS` triggers zero violations on the new path
- **Latency regression ≤ 20%**: the new path may be slightly slower due to JSON mode constraints; beyond 20% is a concern

If parity fails on any criterion, file `BLOCKED.md` with the specifics and stop. Do not proceed to A.4.

### Commit message

> `audit OT-A.3: synthesis behind USE_AI_SDK_SYNTHESIS feature flag`
>
> `Adds a parallel path for the Opus synthesis step using Vercel AI SDK's`
> `streamObject through AI Gateway with Anthropic native prompt caching.`
> `Default: flag OFF — old path continues to run. Flag ON in dev for A/B.`
>
> `SynthesisOutputSchema lives at engine/analyst/cognitive/synthesis-schema.ts.`
> `Parity A/B comparison runs documented in docs/operational-tooling/`
> `OT-A-3-ab-results.md.`
>
> `Surfaces: S8, S10`

### A/B results artifact

Write A/B results to `docs/operational-tooling/OT-A-3-ab-results.md`. Include:
- 20 test inputs (scoped to property IDs or Mgmt Co scenarios)
- Parity table (old vs new, per criterion)
- Latency delta
- Any edge cases observed
- Go/no-go decision

---

## Sub-task OT-A.4 — Retire the old path + delete `research-value-extractor.ts`

### Scope

Only execute this if OT-A.3's A/B results meet ALL parity criteria. If they don't, STOP — this sub-task is conditional.

### Changes

1. Flip `USE_AI_SDK_SYNTHESIS` default to `true` (or remove the flag and make the new path the only path).
2. Delete the `else` branch from `research-orchestrator.ts` — the old raw-Anthropic synthesis block.
3. Delete `server/ai/research-value-extractor.ts` — its job is subsumed by Zod schema validation in `streamObject`.
4. Delete `tests/ai/ai-sdk-client.smoke.test.ts` (from A.2).
5. Grep for any other consumers of `research-value-extractor.ts` and migrate them to consume the structured output directly from the orchestrator.

### Commit message

> `audit OT-A.4: retire raw-Anthropic synthesis; delete research-value-extractor`
>
> `OT-A.3 A/B results met all parity criteria (see OT-A-3-ab-results.md).`
> `Removing the parallel path:`
> `  - Default USE_AI_SDK_SYNTHESIS is now true (or flag removed entirely).`
> `  - Old Anthropic.messages.stream synthesis block deleted.`
> `  - research-value-extractor.ts deleted (195 lines).`
> `  - Smoke test from A.2 deleted.`
>
> `All downstream consumers now receive structured verdicts directly from`
> `streamObject's Zod-validated output.`
>
> `Surfaces: S8, S10`

### Rollback plan

If an issue surfaces after A.4 in production, revert the commit. The old code paths are preserved in git history. A rollback commit restores the pre-A.4 state.

---

## Boundaries — what NOT to touch

This is mandatory. Every file outside this list is **not yours** in OT-A.

### You may create

- `server/ai/ai-sdk-clients.ts` (OT-A.2)
- `tests/ai/ai-sdk-client.smoke.test.ts` (OT-A.2, deleted in OT-A.4)
- `engine/analyst/cognitive/synthesis-schema.ts` (Claude Code provides the content; you commit it)
- `docs/operational-tooling/OT-A-3-ab-results.md` (OT-A.3)

### You may edit

- `server/ai/research-orchestrator.ts` (OT-A.1 caching + OT-A.3 feature flag branch + OT-A.4 flag flip)
- `server/ai/clients.ts` (OT-A.1 only if applying cache_control to panel calls requires it)
- `package.json` + `package-lock.json` (OT-A.2 installs)
- `server/ai/research-value-extractor.ts` is DELETED in OT-A.4 (no edits in between)

### You may NOT touch

- `engine/analyst/**` — Phase 3b and Phase 4 territory. The contracts are frozen.
- `engine/watchdog/*Evaluator.ts` — Phase 3b territory.
- `server/routes/**` — Phase 3b wires the Router into routes; OT-A is plumbing-only.
- `client/src/**` — the SSE event shape must stay compatible; no UI changes.
- `.claude/rules/**` — rules are Claude Code's domain.
- `tests/analyst/**` — Phase 3a tests stay as-is. A/B results go in `docs/`, not `tests/`.
- `tests/audit/vocabulary-compliance.test.ts` — unchanged.
- Any Cognitive Engine file NOT listed above — e.g. `server/ai/comparables/**`, `server/ai/knowledge-base.ts`, etc. If you find yourself wanting to touch one of these, STOP and file BLOCKED.

### If you discover a need outside this list

Stop. Write to `docs/operational-tooling/BLOCKED-OT-A.md`. Do not expand scope.

---

## Pre-commit verification — all five gates on every commit

Per `.claude/rules/pre-commit-verification.md`:

1. `npx tsc --noEmit --skipLibCheck` — exit 0
2. `npm run lint` — exit 0
3. `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 pass
4. `npm run test:summary` — all pass (including your A.2 smoke test while it exists)
5. `npm run verify:summary` — UNQUALIFIED

Commit message footer on every commit:

```
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED
```

And the standard `Surfaces:` footer per guardrail #3.

### Commit cadence

One commit per sub-task:
- Commit 1: OT-A.1 (native caching)
- Commit 2: OT-A.2 (SDK + Gateway plumbing)
- Commit 3: OT-A.3 (synthesis feature flag + A/B setup)
- Commit 4: OT-A.4 (retire old path + delete extractor) — only if A.3 parity passed

Each commit independently passes all five gates. No "build on a failing commit."

---

## A safety net: what "rollback" looks like

If any sub-task creates an unexpected regression in production after merge:

- **OT-A.1:** Revert the cache_control change. Native caching is a soft performance optimization; removing it is safe.
- **OT-A.2:** Uninstall packages, delete the new wrapper file, delete smoke test. No consumers yet.
- **OT-A.3:** Set `USE_AI_SDK_SYNTHESIS=false` in Replit Secrets. Old path resumes immediately. No code revert needed.
- **OT-A.4:** Git revert. The deleted `research-value-extractor.ts` is restored from history; the `else` branch in the orchestrator comes back.

Rollback for A.1/A.2/A.3 is env-var-level (seconds). Rollback for A.4 is a revert commit (minutes).

---

## When the whole phase is done

1. Push each sub-task commit to `main` in order, gated by its own verification run.
2. Append a ≤5-line entry to `.claude/session-memory.md`:
   > `Phase OT-A complete: Vercel AI SDK + AI Gateway adopted. Synthesis via streamObject with Anthropic native prompt caching. research-value-extractor.ts retired. Vercel dashboard shows per-request cost attribution. Commits <A.1>, <A.2>, <A.3>, <A.4>.`
3. Reply on this channel with the four commit SHAs and any A/B caveats from OT-A-3-ab-results.md.
4. Claude Code will then draft the OT-B handoff (Promptfoo CI gate).

---

## What Phase OT-B (Promptfoo) will do after OT-A lands

For context only — so you know what the next handoff looks like:

1. Install `promptfoo` CLI.
2. Port `tests/analyst/personas/lb.test.ts` stub cases to a `promptfoo/config.yaml` (plus 5-10 additional persona cases Claude Code will author).
3. Wire GitHub Action that runs Promptfoo on every PR touching `engine/analyst/**`, `server/ai/**`, or `.claude/rules/**`.
4. PR-comment integration on persona regressions.

OT-B is parallel-track to Phase 4 (Specialist build-out). It doesn't block anything you're doing.

---

## Conflict check

If any instruction in this brief contradicts `.claude/rules/the-analyst-persona.md`, `.claude/rules/analyst-team.md`, `.claude/rules/claude-replit-split.md`, or `.claude/rules/pre-commit-verification.md`, **the `.claude/rules/*` files win**. Flag the contradiction in `BLOCKED-OT-A.md` and stop before proceeding.
