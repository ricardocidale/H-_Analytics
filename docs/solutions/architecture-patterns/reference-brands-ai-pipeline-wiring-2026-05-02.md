---
title: "Wiring a DB-backed table into the AI orchestrator + specialist pipeline"
date: "2026-05-02"
category: docs/solutions/architecture-patterns
module: ai/orchestrator
problem_type: architecture_pattern
component: assistant
severity: medium
applies_when:
  - Adding a new platform DB table whose data should be visible to the LLM during research or specialist runs
  - Extending handleToolCall with a tool that needs live DB data without coupling the prompt-builder layer to the server runtime
  - Adding comp-set or benchmark context to a Specialist's FundingPromptInput without violating ADR-007
tags:
  - ai-orchestrator
  - dependency-injection
  - adr-007
  - research-tools
  - funding-specialist
  - knowledge-base
  - reference-brands
---

# Wiring a DB-backed table into the AI orchestrator + specialist pipeline

## Context

The `reference_brands` table holds curated boutique/lifestyle hospitality brand data
(ADR/RevPAR benchmarks, scale, ownership models) populated exclusively by the Analyst.
Three AI surfaces needed to see this data:

1. **Research orchestrator** (`generateResearchWithToolsStream`) — the model needs a
   `get_reference_brands` tool so it can request live comp-set data during property research.
2. **Funding Specialist** (`runFundingV1Path`) — the Prompt Engineer should receive the
   brand data as orientation-grade context alongside the portfolio inputs.
3. **Rebecca KB** (`indexKnowledgeBase`) — the semantic search index should include brand
   summaries so Rebecca can surface them via natural language queries.

The complication: `handleToolCall` in `research-tool-prompts.ts` is historically pure
(synchronous prompt builders + compute tools). Adding a live DB call there would violate
ADR-007, which forbids DB imports in the prompt-builder and funding-builder layers.

## Guidance

Use **three separate integration points**, each following the layer's own DB-access rule:

### Gap 1 — Research tool: DI pattern on `handleToolCall`

Add a `ResearchToolDeps` interface with an optional `getReferenceBrands` fetcher.
The function stays import-free of the server runtime; the caller (the orchestrator in
`aiResearch.ts`) supplies the fetcher:

```ts
// research-tool-prompts.ts
export interface ResearchToolDeps {
  getReferenceBrands?: () => Promise<ReferenceBrand[]>;
}

export async function handleToolCall(
  name: string,
  input: Record<string, any>,
  deps?: ResearchToolDeps,
): Promise<string> {
  if (name === "get_reference_brands") {
    if (!deps?.getReferenceBrands) {
      return "Reference brand data is not available in this context. Proceed with general market knowledge.";
    }
    const brands = await deps.getReferenceBrands();
    if (brands.length === 0) return "No reference brands configured. Proceed with general market knowledge.";
    return JSON.stringify(brands, null, 2);
  }
  // ... existing handlers
}
```

```ts
// aiResearch.ts — caller builds deps and passes them
import { storage } from "../storage.js";
const deps: ResearchToolDeps = { getReferenceBrands: () => storage.getReferenceBrands() };
const results = await Promise.all(
  response.toolCalls.map((tc) => handleToolCall(tc.name, tc.input, deps))
);
```

The Anthropic tool schema lives at `.claude/tools/get-reference-brands.json` — it is
picked up by the existing `loadToolDefinitions()` JSON scanner with no code change.

### Gap 2 — Funding Specialist: local summary type + route-layer mapping

`mgmt-co-funding-prompt-input-builder.ts` must stay DB-import-free (ADR-007 §1).
Define a slim `ReferenceBrandSummary` interface locally; the route does the mapping:

```ts
// mgmt-co-funding-prompt-input-builder.ts (no DB imports)
export interface ReferenceBrandSummary {
  brandName: string;
  niche: string | null;
  adrUsd: number | null;
  occupancyPct: number | null;
  revparUsd: number | null;
  propertyCount: number | null;
  geographicFocus: string | null;
}

export interface FundingPromptInputContext {
  // ...existing fields...
  referenceBrands?: readonly ReferenceBrandSummary[];
}
```

```ts
// analyst-admin.ts (route layer — DB access is fine here)
const rawBrands = await storage.getReferenceBrands();
const referenceBrands: ReferenceBrandSummary[] = rawBrands.map((b) => ({
  brandName: b.brandName, niche: b.niche ?? null, /* ... */
}));
const ctx: FundingPromptInputContext = {
  // ...
  referenceBrands: referenceBrands.length > 0 ? referenceBrands : undefined,
};
```

Empty array collapses to `undefined` so the Prompt Engineer receives a clean signal
and can skip the section rather than rendering an empty comp-set block.

### Gap 3 — Rebecca KB: fetch at indexing time, not inside the formatter

`buildReferenceBrandsKbDoc()` in `kb-content.ts` is a **pure formatter** — it accepts
`ReferenceBrand[]` and returns chunk objects. The indexing function in `knowledge-base.ts`
calls `storage.getReferenceBrands()` and passes the result in, wrapped in try/catch so a
failed DB fetch never breaks the full index rebuild:

```ts
// knowledge-base.ts
try {
  const refBrands = await storage.getReferenceBrands();
  if (refBrands.length > 0) {
    allChunks.push(...buildReferenceBrandsKbDoc(refBrands));
  }
} catch (err) {
  logger.warn(`KB: reference brands fetch failed — skipping (${String(err)})`, "knowledge-base");
}
```

## Why This Matters

- **ADR-007 compliance**: The prompt-builder and funding-builder layers stay DB-import-free.
  Violations here cause subtle failures when those modules are imported in test or
  non-server contexts.
- **Graceful fallback**: Legacy callers of `handleToolCall` that omit `deps` still work
  (return a polite "not available" string). This is important because the function is
  re-exported from `aiResearch.ts` and may be called by other modules.
- **KB resilience**: A failed DB fetch during index rebuild should never prevent the
  rest of the KB (methodology, platform guide, assets) from being indexed. The try/catch
  guard is mandatory.

## When to Apply

- Any new DB-backed tool added to `handleToolCall` that needs live data.
- Any new field on a Specialist's `PromptInputContext` that comes from the DB.
- Any new entity type that should be semantically searchable via Rebecca.

## Examples

**Before** — would violate ADR-007:
```ts
// research-tool-prompts.ts ← WRONG: DB import in prompt-builder layer
import { storage } from "../storage.js";
if (name === "get_reference_brands") {
  return JSON.stringify(await storage.getReferenceBrands(), null, 2);
}
```

**After** — correct DI pattern:
```ts
// research-tool-prompts.ts ← no DB import
export interface ResearchToolDeps {
  getReferenceBrands?: () => Promise<ReferenceBrand[]>;
}
export async function handleToolCall(name, input, deps?: ResearchToolDeps) { ... }

// aiResearch.ts ← DB access here, passes fetcher as dep
const deps = { getReferenceBrands: () => storage.getReferenceBrands() };
```

## Related

- `artifacts/api-server/src/ai/research-tool-prompts.ts` — `ResearchToolDeps`, `handleToolCall`
- `artifacts/api-server/src/ai/aiResearch.ts` — deps construction and dispatch
- `artifacts/api-server/src/ai/specialists/mgmt-co-funding-prompt-input-builder.ts` — `ReferenceBrandSummary`
- `artifacts/api-server/src/routes/analyst-admin.ts` — route-layer mapping
- `artifacts/api-server/src/ai/kb-content.ts` — `buildReferenceBrandsKbDoc` pure formatter
- `artifacts/api-server/src/ai/knowledge-base.ts` — indexing call with try/catch guard
- `.claude/tools/get-reference-brands.json` — Anthropic tool schema
- `docs/handoffs/reference-brands-orchestrator-specialists.md` — original CC handoff brief (superseded)
- ADR-007 — funding/prompt-builder purity contract
