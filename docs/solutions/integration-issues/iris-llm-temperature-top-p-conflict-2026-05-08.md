---
title: "Iris runs fail: callLlm passes top_p unconditionally, Anthropic rejects temperature+top_p together"
date: 2026-05-08
category: integration-issues
module: iris-agent
problem_type: integration_issue
component: assistant
severity: high
symptoms:
  - "Every Iris LLM call fails immediately after dispatch"
  - "Run rows inserted with status=running but never advance to completed"
  - "Server error: temperature and top_p cannot both be specified for this model"
  - "Iris run history shows failed runs with no summary output"
root_cause: provider_api_constraint
resolution_type: code_fix
tags:
  - iris
  - callLlm
  - anthropic
  - temperature
  - top_p
  - sampling-parameters
  - provider-symmetry
---

# Iris runs fail: callLlm passes top_p unconditionally, Anthropic rejects temperature+top_p together

## Problem

Every Iris agent run failed immediately at the first LLM call. Runs were inserted into `iris_runs`
with `status = "running"` but never advanced — the LLM call always threw before producing output.

## Symptoms

- Iris runs appear to start (run ID inserted, `status = "running"`) but never produce output
- `GET /api/admin/iris/status` shows the run permanently in `running` state
- Server logs show: `BadRequestError: temperature and top_p cannot both be specified for this model`
- Iris run history in `artifacts/api-server/iris/run-history/` shows failed entries with no summary
- The `trigger_iris_health_check` Rebecca tool always returns an error result

## What Didn't Work

Inspecting the Iris agent code in isolation did not surface the bug. `IRIS_TOP_P = 0.9` appeared
to be a reasonable sampling config: a named constant, within the [0, 1] range, with a comment
explaining its purpose. The failure was only visible by tracing the value through `callLlm` to
the Anthropic SDK call site.

## Solution

**Step 1 — Make `topP` optional in `callLlm` and `callLlmStream` sampling types:**

```ts
// Before — required, so every caller must provide it
sampling: { temperature: number; maxOutputTokens: number; topP: number }

// After — optional, callers that don't need top_p omit it
sampling: { temperature: number; maxOutputTokens: number; topP?: number }
```

**Step 2 — Use a conditional spread in every provider branch:**

```ts
// Before (Anthropic branch in callLlm, and equivalents in OpenAI, Gemini, Perplexity):
temperature: sampling.temperature,
top_p: sampling.topP,          // sent even when undefined

// After (all provider branches):
temperature: sampling.temperature,
...(sampling.topP !== undefined ? { top_p: sampling.topP } : {}),
// Gemini uses topP (camelCase) instead of top_p:
...(sampling.topP !== undefined ? { topP: sampling.topP } : {}),
```

Apply this pattern to all five call sites: Anthropic batch, OpenAI batch, Gemini batch,
streaming OpenAI, streaming Gemini, and streaming Anthropic. The Perplexity branch also needs
the guard even though `top_p: undefined` is less likely to cause a hard rejection there.

**Step 3 — Remove `topP` from the Iris agent sampling config and add an explanatory comment:**

```ts
// Before
const IRIS_TOP_P = 0.9;
const sampling = {
  temperature: IRIS_TEMPERATURE,
  maxOutputTokens: IRIS_MAX_OUTPUT_TOKENS,
  topP: IRIS_TOP_P,
};

// After
const sampling = {
  temperature: IRIS_TEMPERATURE,
  maxOutputTokens: IRIS_MAX_OUTPUT_TOKENS,
  // topP intentionally omitted — Anthropic rejects requests that set both
  // temperature and top_p simultaneously.
};
```

## Why This Works

The Anthropic API enforces a mutual-exclusion rule: callers must specify *either* `temperature`
*or* `top_p`, not both. When `callLlm` spread the sampling object into the SDK call, it included
`top_p` even when the value was `undefined`, because JavaScript object spread includes
`undefined`-valued keys as explicit properties. Anthropic's request validator sees both fields
present and rejects the request.

Using `...(value !== undefined ? { key: value } : {})` omits the key entirely when the value is
absent — the SDK call never sees the field. Removing `topP` from Iris's sampling config removes
the conflict at the source.

The same mutual-exclusion constraint applies to OpenAI, Gemini, and Perplexity when both
parameters are explicitly present — the fix was applied to all branches defensively.

## Prevention

**Make optional sampling parameters actually optional in the type signature.** A required
`topP: number` forces every caller to provide it, guaranteeing the conflict for any caller that
also provides `temperature`. Optional (`topP?: number`) lets callers omit it and makes the
intent explicit.

**Always use conditional spread for provider-specific sampling parameters.** Never spread the
entire sampling object directly into a provider request body — providers have different
required/forbidden field combinations. Map fields explicitly:

```ts
// Preferred pattern for all provider branches in callLlm / callLlmStream
{
  temperature: sampling.temperature,
  max_tokens: sampling.maxOutputTokens,
  ...(sampling.topP !== undefined ? { top_p: sampling.topP } : {}),
}
```

**Add a comment on any sampling config that intentionally omits a parameter.** Without the
comment, a future contributor adding `top_p` back to the Iris config will not know about the
Anthropic constraint and will reintroduce the bug.

**When changing the `callLlm` sampling type, update all provider branches.** The
`cross-check-invariants` skill lists this as an H+-specific invariant pair: if you make a
sampling field optional, apply the conditional-spread guard to every provider branch in the same
commit.

## Related

- `artifacts/api-server/src/ai/iris/agent.ts` — `IRIS_TOP_P` constant removed; `topP` removed from `sampling`
- `artifacts/api-server/src/routes/chat.ts` — `callLlm` / `callLlmStream`: `topP` made optional; all five provider branches now use conditional spread
- `.agents/skills/cross-check-invariants/SKILL.md` — H+-specific pairs: `callLlm sampling type → guard all provider branches`
