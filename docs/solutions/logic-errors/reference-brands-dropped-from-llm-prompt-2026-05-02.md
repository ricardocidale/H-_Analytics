---
title: "referenceBrands fetched but never injected into funding market panel LLM prompt"
date: 2026-05-02
category: logic-errors
module: ai/specialists
problem_type: logic_error
component: assistant
severity: high
symptoms:
  - "AI funding market analysis never referenced benchmark brands despite data existing in DB"
  - "referenceBrands field populated in FundingPromptInputContext but absent from all prompt files"
  - "No error, warning, or log message — data silently discarded before prompt construction"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - database
tags:
  - llm-prompt
  - context-loss
  - funding-panel
  - silent-bug
  - reference-brands
---

# referenceBrands fetched but never injected into funding market panel LLM prompt

## Problem

`FundingPromptInputContext.referenceBrands` was populated in the funding path execution and
fetched from the DB in the route layer — but `buildMarketPanelUserPrompt()` never consumed it.
The competitor brand benchmarks were silently discarded at the prompt-building step, so the LLM
market analysis ran without reference brand data despite it being available.

## Symptoms

- No error, no warning, no log entry indicating data loss.
- AI funding market analysis outputs appeared complete and coherent but contained no reference
  to competitor brand benchmarks even when brands were on file for the property.
- Omission was only detectable by manually comparing the context object's field list against
  the strings interpolated in every prompt builder function — not by observing any runtime failure.

## What Didn't Work

The root cause was found by direct inspection: comparing `FundingPromptInputContext` field
declarations against occurrences of each field name in `mgmt-co-funding-market-panel-prompt.ts`.
No failed investigation attempts preceded the fix.

## Solution

In `artifacts/api-server/src/ai/specialists/mgmt-co-funding-market-panel-prompt.ts`, added
`brandsBlock` construction and interpolation inside `buildMarketPanelUserPrompt()`:

```typescript
const brandsBlock =
  ctx.referenceBrands && ctx.referenceBrands.length > 0
    ? ctx.referenceBrands
        .map((b, idx) => {
          const parts = [
            b.niche ? `niche: ${b.niche}` : null,
            b.adrUsd != null ? `ADR ${b.adrUsd}` : null,
            b.occupancyPct != null ? `occ ${(b.occupancyPct * 100).toFixed(0)}%` : null,
            b.revparUsd != null ? `RevPAR ${b.revparUsd}` : null,
            b.propertyCount != null ? `${b.propertyCount} props` : null,
            b.geographicFocus ? `focus: ${b.geographicFocus}` : null,
          ]
            .filter(Boolean)
            .join(", ");
          return `  [${idx}] ${b.brandName}${parts ? ` — ${parts}` : ""}`;
        })
        .join("\n")
    : "  (none on file)";
```

Inserted into the prompt string:

```
# Reference brands on file
${brandsBlock}
[note: use as directional benchmarks only — data may be user-estimated]
```

The system prompt was also updated to mention that reference brand benchmarks are available
when brands are on file, so the LLM weights them appropriately in its market analysis.

## Why This Works

The data flow had a gap between context assembly and prompt construction:

```
DB fetch → FundingPromptInputContext.referenceBrands → buildMarketPanelUserPrompt() → [GAP] → LLM
```

TypeScript did not catch this because the prompt builder accepted the full context object and
was not required to use every field — unused fields are not type errors. The fix closes the
gap by explicitly projecting `ctx.referenceBrands` into a formatted string and interpolating
it. The `(none on file)` fallback ensures the LLM always sees the section header, preventing
hallucination of brand data when none exists.

## Prevention

**1. Coverage check after adding a context field**: When a new field is added to a prompt
context type, grep all prompt builder functions that accept that type to verify the field
appears in at least one interpolated string:

```bash
grep -n "referenceBrands" artifacts/api-server/src/ai/specialists/mgmt-co-funding-market-panel-prompt.ts
# Zero hits → field is unwired
```

**2. Prompt content unit test**: Assert that a context object with all optional fields
populated produces a prompt containing data from each field:

```typescript
it("includes reference brands in market panel prompt", () => {
  const ctx = buildTestContext({ referenceBrands: [{ brandName: "Acme Stays", adrUsd: 350 }] });
  const prompt = buildMarketPanelUserPrompt(ctx);
  expect(prompt).toContain("Acme Stays");
});
```

**3. Use literal types for discriminated channels**: In the same session, the pre-existing
`logNotification(channel: string)` type error in `notifications/engine.ts` was fixed by
narrowing the parameter to `channel: "email"`. Prefer literal types or enums over `string`
for parameters that only accept a known set of values — TypeScript then enforces correctness
at call sites and enables exhaustiveness checking downstream.

## Related Issues

- `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md` —
  the correct DI pattern for wiring DB-backed tables into the AI orchestrator + specialist
  pipeline (handleToolCall deps, ADR-007 compliance, KB indexing)
- `artifacts/api-server/src/ai/specialists/mgmt-co-funding-market-panel-prompt.ts` — the fix
- `artifacts/api-server/src/ai/specialists/mgmt-co-funding-prompt-input-builder.ts` —
  `FundingPromptInputContext` type definition
- ADR-007 — funding/prompt-builder purity contract (no DB imports in prompt-builder layer)
