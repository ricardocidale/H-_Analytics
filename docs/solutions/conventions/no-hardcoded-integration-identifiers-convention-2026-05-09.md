---
title: No Hardcoded Integration Identifiers
date: 2026-05-09
category: docs/solutions/conventions
module: no-magic-numbers
problem_type: convention
component: tooling
severity: high
resolution_type: documentation_update
applies_when:
  - Adding or referencing an LLM model name in TypeScript source code
  - Adding or referencing an API slug (exa, perplexity, tripadvisor, FRED) in source code
  - Adding or referencing an MCP slug in source code
  - Adding an endpoint URL as a string literal or named constant in source code
  - Creating a Zod enum or TypeScript union type whose members are provider, model, or API names
tags:
  - no-magic-numbers
  - integration-identifiers
  - admin-resources
  - llm-providers
  - api-slugs
  - mcp-slugs
  - hardcoded-strings
  - rebecca-settings
---

# No Hardcoded Integration Identifiers

## Context

During the U12 branch work (replacing Perplexity with Exa as Rebecca's web-search provider), a code review found a class of violation not previously covered by the "no magic numbers" rule: string-typed integration identifiers hardcoded as TypeScript source values. The codebase had accumulated:

- `const REBECCA_LLM_PROVIDERS = ["openai", "anthropic", "gemini", "exa"] as const`
- `type RebeccaLlmProvider = "openai" | "anthropic" | "gemini" | "exa"`
- `const REBECCA_DEFAULT_MODEL: Record<RebeccaLlmProvider, string> = { gemini: "gemini-2.0-flash", ... }`
- `provider: z.enum(REBECCA_LLM_PROVIDERS)` — Zod enum locking in the provider list at compile time

These are structurally identical to numeric magic numbers: invisible configuration masquerading as code. The existing `check-magic-numbers.ts` gate scans only numeric literals and cannot detect this class of violation. (session history)

A secondary confusion surfaced: Exa and Perplexity are **APIs**, not LLM providers. The initial Phase E implementation added Exa to `REBECCA_LLM_PROVIDERS` alongside `"gemini"` — conflating `admin_resources kind='api'` with `kind='model'` and embedding an architectural misclassification into the type system. (session history)

The `admin_resources` table was already the intended single source of truth for all external integrations. This convention formalises that intent as an enforceable rule.

## Guidance

**The rule (one sentence):** LLM model names, API slugs, MCP slugs, and endpoint URLs must never appear as TypeScript string literals or string constants anywhere in source code — they live in `admin_resources` rows and are fetched at runtime. Wrapping a hardcoded string in a `const` is the same violation with a disguise.

### The `admin_resources` authority table

| Integration type | `kind` value | Runtime access path |
|---|---|---|
| LLM models / providers | `model` | `GET /api/llm-providers` |
| LLM routing slots | `llm_slot` | query by slug |
| External APIs (Exa, Perplexity, TripAdvisor, FRED…) | `api` | query by `config` flag |
| MCP servers | `mcp` | query filtered by `kind='mcp'` |
| Endpoint URLs | `config.endpoint` on the relevant row | read from the row |

### Violation patterns

**1. Bare string literal**
```ts
// VIOLATION
const model = "gemini-2.0-flash";
const provider = "gemini";
```

**2. Named constant (the masking anti-pattern)**
```ts
// VIOLATION — the const wrapper doesn't fix it
const GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_PROVIDER = "gemini";
```

**3. Const array of provider slugs**
```ts
// VIOLATION
const REBECCA_LLM_PROVIDERS = ["openai", "anthropic", "gemini"] as const;
```

**4. Closed union type over provider names**
```ts
// VIOLATION — locks a live, admin-controlled list into the type system at compile time
type RebeccaLlmProvider = "openai" | "anthropic" | "gemini" | "exa";
```

**5. Record keyed by the closed union**
```ts
// VIOLATION — hardcodes both the providers and the model IDs
const REBECCA_DEFAULT_MODEL: Record<RebeccaLlmProvider, string> = {
  openai: "gpt-4o",
  gemini: "gemini-2.0-flash",
};
```

**6. Zod enum over a live provider list**
```ts
// VIOLATION — compile-time enum encodes a list that changes at admin runtime
provider: z.enum(REBECCA_LLM_PROVIDERS),
rebeccaChatEngine: z.enum(["gemini", "exa"]),
```

**7. Conflating APIs with LLM providers**
```ts
// VIOLATION — Exa is kind='api', not kind='model'
type RebeccaLlmProvider = "openai" | "anthropic" | "gemini" | "exa";
```

### Correct patterns

**Zod schemas use `z.string()` with bounds, not enums**
```ts
// CORRECT
provider: z.string().min(1).max(80).default("gemini"),
fallbackProvider: z.string().nullable(),
webSearchProvider: z.string().max(80).default("perplexity"),
```

**Default model resolved at runtime from `admin_resources` (with cache)**
```ts
// CORRECT — 5-minute in-process cache; no code deploy needed to update
const _modelCache = new Map<string, { value: string; expiresAt: number }>();

async function resolveDefaultModel(providerId: string): Promise<string | undefined> {
  const cached = _modelCache.get(providerId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const row = await db
    .select()
    .from(adminResources)
    .where(and(eq(adminResources.kind, "model"), eq(adminResources.vendor, providerId)))
    .orderBy(adminResources.sortOrder)
    .limit(1)
    .then((rows) => rows[0]);

  if (row?.slug) {
    _modelCache.set(providerId, { value: row.slug, expiresAt: Date.now() + 5 * 60 * 1000 });
  }
  return row?.slug;
}
```

**Function signatures use `string`, not the closed union**
```ts
// CORRECT — provider is opaque string from admin_resources
async function callLlm(
  provider: string,
  model: string | undefined,
  messages: LlmMessage[],
): Promise<LlmResult> {
  const resolvedModel = model ?? (await resolveDefaultModel(provider));
  // ...
}
```

**API endpoints expose the live list from the DB**
```ts
// CORRECT — GET /api/llm-providers reads admin_resources kind='model'
router.get("/llm-providers", async (_req, res) => {
  const rows = await db
    .select()
    .from(adminResources)
    .where(and(eq(adminResources.kind, "model"), eq(adminResources.enabled, true)))
    .orderBy(adminResources.vendor, adminResources.sortOrder);

  const grouped = rows.reduce<Record<string, string[]>>((acc, row) => {
    (acc[row.vendor] ??= []).push(row.slug);
    return acc;
  }, {});
  res.json(grouped);
});

// CORRECT — GET /api/chat-search-providers reads kind='api' filtered by config flag
router.get("/chat-search-providers", async (_req, res) => {
  const rows = await db
    .select()
    .from(adminResources)
    .where(
      and(
        eq(adminResources.kind, "api"),
        eq(adminResources.enabled, true),
        sql`config->>'rebeccaSearchProvider' = 'true'`,
      ),
    );
  res.json(rows.map((r) => ({ slug: r.slug, label: r.displayName })));
});
```

**Seeding goes through `admin_resources` migrations, not source constants**
```ts
// CORRECT — admin-resources-007.ts seeds Exa as kind='api', not kind='model'
await db.insert(adminResources).values({
  slug: "exa-answer",
  kind: "api",   // API — not an LLM provider
  vendor: "exa",
  config: { rebeccaChatProvider: true, endpoint: "https://api.exa.ai/answer" },
  enabled: true,
}).onConflictDoNothing();
```

### Important: canonical constants files are NOT exempt for strings

`lib/shared/src/constants*.ts` and `lib/db/src/constants.ts` are the canonical home for numeric `DEFAULT_*` values. They are **not** exempt for string-typed integration identifiers. A `const DEFAULT_LLM_PROVIDER = "gemini"` in `constants.ts` is still a violation.

## Why This Matters

**Admin control without code deploys.** When provider names and model IDs live in source constants, swapping a model or adding a new provider requires a code change, a PR, a build, and a Railway deploy. When they live in `admin_resources`, an admin can update them from the Intelligence panel in minutes.

**Type system integrity.** A closed union type `"openai" | "anthropic" | "gemini"` is a compile-time promise that these are the only valid values. That promise is false the moment an admin adds a new provider row. The type system then actively rejects valid runtime values. `z.string()` with runtime validation is honest about what can appear at runtime.

**Architectural classification.** Exa is an API (`kind='api'`). Gemini is an LLM provider (`kind='model'`). Conflating them in a union type embeds a misclassification — and when the system later needs to distinguish them (different auth, different retry logic, different rate limits), the type must be broken anyway.

**The masking anti-pattern is invisible to grep.** A bare `"gemini-2.0-flash"` in a route file is easy to catch. `REBECCA_DEFAULT_MODEL[provider]` reads as intentional named-constant usage — but the table it indexes is still a hardcoded string mapping. The `check-magic-numbers` script cannot detect this; architectural awareness and code review are the enforcement mechanisms.

## When to Apply

- Any string in source code that is a vendor slug (`"openai"`, `"anthropic"`, `"gemini"`, `"exa"`, `"perplexity"`)
- Any string that is a model ID (`"gpt-4o"`, `"claude-3-5-sonnet-20241022"`, `"gemini-2.0-flash"`)
- Any string that is an API slug or MCP slug that appears in `admin_resources`
- Any `z.enum([...])` whose members are provider, model, or API names
- Any TypeScript union type or `as const` array whose members are provider, model, or API names
- Any `Record<ProviderUnion, string>` mapping that hardcodes model IDs
- Any URL string that should be `config.endpoint` on an `admin_resources` row

This applies regardless of file location: route files, schema files, type files, constants files, Zod schemas, seed files.

## Examples

### Before (U12 initial state — violations throughout)

```ts
// lib/shared/src/rebecca-settings.ts
export const REBECCA_LLM_PROVIDERS = ["openai", "anthropic", "gemini"] as const;
export type RebeccaLlmProvider = (typeof REBECCA_LLM_PROVIDERS)[number];

export const REBECCA_DEFAULT_MODEL: Record<RebeccaLlmProvider, string> = {
  openai: "gpt-4o",
  anthropic: "claude-3-5-sonnet-20241022",
  gemini: "gemini-2.0-flash",
};

export const rebeccaSettingsSchema = z.object({
  provider: z.enum(REBECCA_LLM_PROVIDERS),          // VIOLATION
  fallbackProvider: z.enum(REBECCA_LLM_PROVIDERS).nullable(), // VIOLATION
});

// artifacts/api-server/src/routes/global-assumptions.ts
rebeccaChatEngine: z.enum(["gemini", "exa"]),        // VIOLATION

// artifacts/api-server/src/routes/chat.ts
async function callLlm(provider: RebeccaLlmProvider, ...) { // VIOLATION — closed union
  const resolvedModel = model ?? REBECCA_DEFAULT_MODEL[provider]; // VIOLATION — hardcoded table
```

### After (runtime fetch from `admin_resources`)

```ts
// lib/shared/src/rebecca-settings.ts
// No REBECCA_LLM_PROVIDERS, no RebeccaLlmProvider, no REBECCA_DEFAULT_MODEL

export const rebeccaSettingsSchema = z.object({
  provider: z.string().min(1).max(80).default("gemini"),  // CORRECT
  fallbackProvider: z.string().nullable(),                  // CORRECT
  sources: z.object({
    webSearchProvider: z.string().max(80).default("perplexity"), // CORRECT
  }),
});

// artifacts/api-server/src/routes/global-assumptions.ts
rebeccaChatEngine: z.string().max(80), // CORRECT — accepts whatever admin configured

// artifacts/api-server/src/routes/chat.ts
async function callLlm(provider: string, ...) { // CORRECT — open string
  const resolvedModel = model ?? (await resolveDefaultModel(provider)); // reads admin_resources
```

## Related

- `docs/solutions/tooling/magic-numbers-ratchet-improvements.md` — the numeric-literal half of this rule; `check-magic-numbers.ts` gate description, masking anti-pattern for numbers, canonical constants files
- `.agents/skills/no-magic-numbers/SKILL.md` — full rule including "External integration identifiers" section added in this session
- `CLAUDE.md §1` — "No Hardcoded Values" enforcement reminder (numeric + string rule, authority table)
