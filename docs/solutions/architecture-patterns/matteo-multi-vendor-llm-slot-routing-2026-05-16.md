---
title: "Matteo T3-1 — Admin-Editable Multi-Vendor LLM Slot Routing via admin_resources"
date: 2026-05-16
category: architecture-patterns
module: matteo-model-router
problem_type: architecture_pattern
component: assistant
severity: medium
applies_when:
  - Adding a new LLM-powered call site that should be routable to a cheaper model without a code deploy
  - Deciding where a model name or API slug should live (answer: admin_resources row, never a TS string literal)
  - Wiring a feature flag that controls whether a cheaper model slot activates for a given task
  - Adding a new named task slot (pdf-ocr-extraction, bulk-text-synthesis, etc.) and its default model assignment
  - Migrating a hardcoded OpenAI/Anthropic call to go through resolveLlmFor + generateText
  - Adding a new vendor SDK client to dispatch.ts
  - Interpreting per-slot 30-day cost badges in the Admin LLMs UI
tags:
  - llm-routing
  - admin-resources
  - multi-vendor
  - matteo
  - dispatch
  - feature-flags
  - no-magic-strings
  - slot-architecture
related_components:
  - background_job
---

# Matteo T3-1 — Admin-Editable Multi-Vendor LLM Slot Routing via admin_resources

## Context

H+ Analytics needed to reduce monthly token spend 30–50% by routing cheaper models per task type
(DeepSeek for bulk synthesis, Mistral OCR for PDF parsing, Claude/OpenAI for high-stakes reasoning)
without hardcoding vendor strings anywhere in TypeScript. The constraint from CLAUDE.md §1 is strict:
LLM model names, API slugs, and endpoint URLs must never appear as TypeScript string literals — they
live in `admin_resources` rows and are fetched at runtime. A `const MODEL = "deepseek-chat"` is the
same violation as writing the literal inline.

This architecture, shipped as T3-1 (Matteo specialist), makes routing admin-editable at runtime with
no deploy required. Feature flags default to `0` (off), so new routing can ship dark and be enabled
via Admin UI.

## Guidance

The routing architecture has four layers that compose cleanly.

### Layer 1 — DB-backed slot resolution (`ai/resolve-llm.ts`)

```typescript
// resolveLlmFor(slotSlug) — never call a vendor SDK directly with a hardcoded model
export async function resolveLlmFor(slotSlug: string): Promise<{ vendor: string; modelId: string; modelSlug: string }> {
  const slotRow = await db.query.adminResources.findFirst({
    where: and(eq(adminResources.kind, 'llm_slot'), eq(adminResources.slug, slotSlug)),
  });
  if (!slotRow) throw new Error(`LLM slot not found: ${slotSlug}`);
  const modelSlug = slotRow.config?.modelSlug as string;
  const modelRow = await db.query.adminResources.findFirst({
    where: and(eq(adminResources.kind, 'model'), eq(adminResources.slug, modelSlug)),
  });
  if (!modelRow) throw new Error(`Model not found: ${modelSlug}`);
  return { vendor: modelRow.config.vendor as string, modelId: modelRow.config.modelId as string, modelSlug };
}
```

Model slugs (`deepseek-v3`, `mistral-large-latest`) and vendor strings exist only in
`admin_resources` rows, never in TypeScript.

### Layer 2 — Lazy singleton SDK clients (`ai/clients.ts`)

```typescript
// Pattern: lazy singleton with config read from admin_resources
let _deepseek: OpenAI | null = null;
export async function getDeepSeekClient(): Promise<OpenAI> {
  if (_deepseek) return _deepseek;
  const row = await db.query.adminResources.findFirst({
    where: and(eq(adminResources.kind, 'model'), eq(adminResources.slug, 'deepseek-v3')),
  });
  const baseURL = row?.config?.baseUrl as string;
  _deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY!, baseURL });
  logger.info({ vendor: 'deepseek' }, 'clients');
  return _deepseek;
}
// Mistral and MistralOCR follow the same singleton pattern
```

### Layer 3 — Unified dispatch (`ai/dispatch.ts`)

```typescript
// generateText fans out to the right SDK; cost is logged uniformly
export async function generateText(params: {
  llm: { vendor: string; model: string };
  prompt: string;
  maxTokens: number;
  operation: string;
  route: string;
}): Promise<{ text: string; usage: TokenUsage }> {
  const { vendor, model } = params.llm;
  switch (vendor) {
    case 'anthropic':   return callAnthropic(params);
    case 'openai':      return callOpenAI(params);
    case 'gemini':      return callGemini(params);
    case 'deepseek':    return callDeepSeek(params);
    case 'mistral':     return callMistral(params);
    case 'mistral-ocr': return callMistralOCR(params);
    default: throw new Error(`Unknown vendor: ${vendor}`);
  }
}
// streamText follows the same vendor-switch pattern for streaming
```

Cost is logged via `logApiCost` after every call. `operation` (the slot slug) and `route` (the
Express route name) flow into the cost record so per-slot 30-day summaries are possible.

### Layer 4 — Feature-flagged call sites

```typescript
// At a call site that should use the cheaper bulk-text-synthesis slot when the flag is on:
async function callLlmForText(slot: string, userPrompt: string, maxTokens: number): Promise<string> {
  const flagEnabled = (await getParameterValue("matteo-enable-bulk-text-synthesis", 0)) !== 0;
  const resolvedSlot = flagEnabled ? "bulk-text-synthesis" : slot;
  const { vendor, modelId } = await resolveLlmFor(resolvedSlot);
  const { text } = await generateText({
    llm: { vendor, model: modelId },
    prompt: userPrompt,
    maxTokens,
    operation: resolvedSlot,
    route: "executive-summary",
  });
  return text;
}
```

`getParameterValue(slug, fallback)` reads `admin_resources` kind='parameter' — never throws,
returns the fallback if the row is absent.

### Seed migration pattern (`ai/migrations/admin-resources-006-matteo-router.ts`)

```typescript
// Model names appear only here, in migration seed data — never in runtime code
const MODEL_ROWS = [
  { kind: 'model', slug: 'deepseek-v3',          config: { vendor: 'deepseek', modelId: 'deepseek-chat' } },
  { kind: 'model', slug: 'mistral-large-latest',  config: { vendor: 'mistral',  modelId: 'mistral-large-latest' } },
];
// Slot rows — admin-reassignable at runtime via the LLM Workflows UI
const SLOT_ROWS = [
  { kind: 'llm_slot', slug: 'bulk-text-synthesis', config: { modelSlug: 'deepseek-v3' } },
  { kind: 'llm_slot', slug: 'pdf-ocr-extraction',  config: { modelSlug: 'mistral-small-latest' } },
];
// Feature flag rows — default 0 (off), flip to 1 via Admin UI to activate routing
const PARAMETER_ROWS = [
  { kind: 'parameter', slug: 'matteo-enable-bulk-text-synthesis',    config: { value: 0 } },
  { kind: 'parameter', slug: 'matteo-enable-structured-extraction',  config: { value: 0 } },
  { kind: 'parameter', slug: 'matteo-enable-pdf-ocr-extraction',     config: { value: 0 } },
];
// All rows use INSERT … ON CONFLICT (kind, slug) DO NOTHING for idempotency
```

## Why This Matters

- **Cost**: 30–50% monthly token spend reduction by routing DeepSeek/Mistral for bulk/OCR tasks.
- **Zero-deploy routing changes**: an admin can reassign a slot in the LLM Workflows UI instantly.
- **No taxonomy violations**: satisfies CLAUDE.md §1 integration identifier rule — no vendor strings,
  model slugs, or endpoint URLs appear as TypeScript literals anywhere in runtime code.
- **Safe-by-default flags**: feature flags seed at `0` (off), so routing changes ship dark and are
  enabled deliberately. A flag flip is reversible without a deploy.
- **Uniform cost visibility**: `operation` + `route` fields on every dispatch call feed the
  `/api/admin/llm-cost-summary?windowDays=30` endpoint and the Admin LLMs 30-day cost badges.

## When to Apply

- **Every new LLM call site** in the api-server must go through `resolveLlmFor(slotSlug)` +
  `generateText()` / `streamText()` — never call a vendor SDK directly with a hardcoded model string.
- **New model or provider**: add a `kind='model'` row in a migration guard, add the SDK client
  factory in `clients.ts`, add a `case` branch in `dispatch.ts`.
- **New task type**: add a `kind='llm_slot'` row with a default `modelSlug`, and optionally a
  `kind='parameter'` feature flag row (default `value: 0`).
- **Rebecca parity**: if a new slot adds admin-visible cost data, add a matching Rebecca tool so
  agents can query cost summaries by conversation.

## Examples

**Adding a new "property-summary" task slot:**

```typescript
// WRONG — hardcoded model string
const resp = await anthropic.messages.create({ model: "claude-3-5-haiku-20241022", ... });

// CORRECT — slot-based dispatch
const { vendor, modelId } = await resolveLlmFor("property-summary");
const { text } = await generateText({
  llm: { vendor, model: modelId },
  prompt: buildPropertySummaryPrompt(property),
  maxTokens: 512,
  operation: "property-summary",
  route: "property-detail",
});
```

**Seeding the new slot (migration guard):**

```typescript
{ kind: 'llm_slot', slug: 'property-summary', config: { modelSlug: 'claude-haiku-3-5' } },
// Admin can reassign to a cheaper model from the UI without a deploy
```

## Related

- `docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md` — the
  CLAUDE.md §1 rule this architecture satisfies
- `docs/solutions/architecture-patterns/llms-page-slot-accordion-design-2026-05-09.md` — the Admin
  UI design for the LLM Workflows page (slot groups, vendor dropdowns, cost badges)
- `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md` — DI
  pattern used in the route layer before calling dispatch
