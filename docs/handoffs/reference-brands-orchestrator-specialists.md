**From:** Replit Agent (main branch)
**To:** Claude Code (CC)
**Date:** 2026-05-02
**Context:** `reference_brands` table (19 boutique hospitality brands: Axel Hotels, Mama Shelter, Selina, Yotel, Desire Resorts, Eleven Experience + ~13 others). Table is fully seeded, has a GPT-4o auto-refresh function, admin REST surface, and admin UI cards. It is NOT yet wired to the AI research pipeline, specialist prompt context, or Marcela webhook tools.
**Why this is a handoff:** This work crosses the agent boundary. Replit Agent completed the orchestrator KB gap (Gap 3) directly. Gaps 1, 2, and 4 require deeper plumbing into the specialist cognitive pipeline and Marcela webhook surface — CC takes those from here.

---

## Scope of work

Wire the `reference_brands` table into three remaining channels so the AI layer can actually use the data:

1. **Gap 1** — Interactive specialist research tool (`get_reference_brands` in `research-tool-prompts.ts` / `research-resources.ts`)
2. **Gap 2** — Funding specialist prompt context (`mgmt-co-funding-prompt-input-builder.ts` + its route caller)
3. **Gap 4** — Marcela/Gustavo webhook tool (find and extend the ElevenLabs server-side tool surface)

Gap 3 (Rebecca KB vector indexing) is **already done by this agent** — `buildReferenceBrandsKbDoc()` is in `kb-content.ts` and `indexKnowledgeBase()` calls it. Do not redo Gap 3.

---

## What already exists — do NOT touch these

| File | Status |
|---|---|
| `artifacts/api-server/src/storage/intelligence/constants/watchdog.ts` | `getReferenceBrands()`, `getReferenceBrandsSummary()`, `replaceAllReferenceBrands()` — fully wired |
| `artifacts/api-server/src/ai/analyst-table-refresh.ts` | `researchReferenceBrands()` at line 591 — auto-commits, no diff review |
| `artifacts/api-server/src/middleware/analyst-refresh-guards.ts` | `ANALYST_TABLE_ALLOW_LIST` includes `"reference_brands"` |
| `artifacts/api-server/src/routes/admin/analyst-tables.ts` | refresh + allow-list guard; `reference_brands` linked to `"mgmt-co.funding"` (line 121) |
| `artifacts/api-server/src/ai/kb-content.ts` | `buildReferenceBrandsKbDoc(brands)` added ✅ |
| `artifacts/api-server/src/ai/knowledge-base.ts` | calls `buildReferenceBrandsKbDoc` in `indexKnowledgeBase()` ✅ |

---

## File-by-file specification

### Gap 1 — Interactive research tool

**File A:** `artifacts/api-server/src/ai/research-resources.ts`

`loadToolDefinitions()` currently returns a list of Anthropic tool schemas. Add one new entry for `get_reference_brands`. Approximate addition: 25 lines inside the existing tools array.

```typescript
{
  name: "get_reference_brands",
  description: "Retrieve reference boutique/lifestyle hotel brands from the platform's curated database. Use during competitive set analysis, brand positioning research, or comp-set ADR/occupancy benchmarking. Returns structured brand data including niche, ADR, occupancy, RevPAR, property count, and positioning summary.",
  input_schema: {
    type: "object",
    properties: {
      niche: {
        type: "string",
        description: "Optional: filter brands by niche keyword (e.g. 'LGBTQ+', 'wellness', 'experiential'). Leave blank for all brands."
      },
      region: {
        type: "string",
        description: "Optional: filter by geographic focus keyword (e.g. 'Americas', 'Europe', 'global'). Leave blank for all regions."
      },
      limit: {
        type: "number",
        description: "Maximum number of brands to return. Default 10, max 25."
      }
    },
    required: []
  }
}
```

**File B:** `artifacts/api-server/src/ai/research-tool-prompts.ts`

**CRITICAL ARCHITECTURE CONSTRAINT** (confirmed by architect): `handleToolCall` must stay pure — no direct `storage` import. Use a dependency-injection pattern:

```typescript
export interface ResearchToolDeps {
  getReferenceBrands?: () => Promise<import("@workspace/db").ReferenceBrand[]>;
}

export async function handleToolCall(
  name: string,
  input: Record<string, any>,
  deps?: ResearchToolDeps,
): Promise<string> {
  if (name === "get_reference_brands") {
    if (!deps?.getReferenceBrands) {
      return "Reference brands data is not available in this research context.";
    }
    const allBrands = await deps.getReferenceBrands();
    const { niche, region, limit = 10 } = input as { niche?: string; region?: string; limit?: number };
    let filtered = allBrands;
    if (niche) filtered = filtered.filter(b => b.niche?.toLowerCase().includes(niche.toLowerCase()));
    if (region) filtered = filtered.filter(b => b.geographicFocus?.toLowerCase().includes(region.toLowerCase()));
    const top = filtered.slice(0, Math.min(limit, 25));
    if (top.length === 0) return "No reference brands matched the specified filters.";
    const table = top.map(b =>
      `- **${b.brandName}** (${b.niche ?? "n/a"}) | ${b.propertyCount ?? "?"} properties | ADR $${b.adrUsd ?? "n/a"} | Occ ${b.occupancyPct != null ? `${(b.occupancyPct * 100).toFixed(0)}%` : "n/a"} | RevPAR $${b.revparUsd ?? "n/a"} | ${b.geographicFocus ?? "n/a"}`
    ).join("\n");
    return `## Reference Brands (${top.length} of ${allBrands.length} total)\n\n${table}\n\nUse these as comp anchors for ADR, occupancy, and RevPAR benchmarking.`;
  }
  // ... existing handler logic unchanged
```

**File C:** `artifacts/api-server/src/ai/aiResearch.ts`

`generateResearchWithToolsStream` calls `handleToolCall(tc.name, tc.input)`. Update the call signature to pass deps:

```typescript
import { storage } from "../storage";

// Inside generateResearchWithToolsStream, update the tool call handler:
const results = await Promise.all(
  response.toolCalls.map((tc) => handleToolCall(tc.name, tc.input, {
    getReferenceBrands: () => storage.getReferenceBrands(),
  }))
);
```

Approximately 5 lines changed in `aiResearch.ts`. Verify that `storage` is importable here (it should be — same package).

**Acceptance criteria for Gap 1:**
- `pnpm --filter @workspace/api-server run typecheck` exits 0
- The `get_reference_brands` tool appears in the Anthropic tool list when a research job runs
- Calling the tool in a company-research or property-research context returns formatted brand rows
- Existing tool calls (`analyze_competitive_set`, `web_search`, etc.) are completely unchanged

---

### Gap 2 — Funding specialist prompt context

**File:** `artifacts/api-server/src/ai/specialists/mgmt-co-funding-prompt-input-builder.ts`

This file is governed by ADR-007 §1 — **no DB, no LLM, no HTTP, no storage imports**. Keep it pure.

Add two fields to the existing interfaces:

```typescript
// Add to FundingPromptInputContext:
export interface FundingPromptInputContext {
  inputs: CapitalRaiseInputs;
  portfolio: PortfolioAggregate;
  persona: FundingPersonaContext;
  icpModel?: IcpModelProfile | null;
  priorVerdicts?: readonly PriorVerdictRef[];
  /** Reference brands from the curated comp database — fetched by caller, never by this builder. */
  referenceBrands?: readonly ReferenceBrandSummary[];
}

// Add a lightweight summary shape (to avoid importing full DB type):
export interface ReferenceBrandSummary {
  brandName: string;
  niche: string | null;
  propertyCount: number | null;
  adrUsd: number | null;
  occupancyPct: number | null;
  revparUsd: number | null;
  geographicFocus: string | null;
  positioningSummary: string | null;
}

// Add to FundingPromptInput:
export interface FundingPromptInput {
  specialistId: "mgmt-co.funding";
  requiredFields: readonly FundingDimensionDescriptor[];
  portfolio: PortfolioAggregate;
  persona: FundingPersonaContext;
  currentValues: Readonly<Record<FundingDimensionKey, number | null>>;
  priorVerdicts: readonly PriorVerdictRef[];
  intent: string;
  /** Comp brands for runway/sizing calibration — may be empty. */
  referenceBrands: readonly ReferenceBrandSummary[];
}

// Update buildFundingPromptInput to pass through:
export function buildFundingPromptInput(ctx: FundingPromptInputContext): FundingPromptInput {
  const currentValues = /* ... unchanged ... */;
  return {
    specialistId: "mgmt-co.funding",
    requiredFields: FUNDING_DIMENSIONS,
    portfolio: ctx.portfolio,
    persona: ctx.persona,
    currentValues,
    priorVerdicts: ctx.priorVerdicts ?? [],
    intent: FUNDING_INTENT,
    referenceBrands: ctx.referenceBrands ?? [],
  };
}
```

**The route that calls `buildFundingPromptInput`** (find it — likely somewhere in `routes/admin/` or `routes/research/`) must be updated to:
1. Call `await storage.getReferenceBrands()` before assembling context
2. Map the result to `ReferenceBrandSummary[]` (drop fields not in the summary shape)
3. Pass `referenceBrands: mappedBrands` into `FundingPromptInputContext`

**Acceptance criteria for Gap 2:**
- `buildFundingPromptInput` in `mgmt-co-funding-prompt-input-builder.ts` has zero storage imports
- The funding prompt payload includes a non-empty `referenceBrands` array when the table has data
- The cross-check test (`artifacts/api-server/src/tests/mgmt-co-funding-dimension-keys.test.ts` or similar) still passes

---

### Gap 4 — Marcela / Gustavo webhook tool

**Important:** The grep-search for existing webhook tool registrations (`getProperties`, `getPortfolioSummary`, `getGlobalAssumptions`) returned no results in the route files. This means one of:
- (a) The Marcela webhook surface is defined in the ElevenLabs Convai agent config (external, not in this codebase), or
- (b) The tools are registered server-side in a file that needs to be discovered

**CC's first step for Gap 4:**
1. Search: `grep -rn "getPortfolioSummary\|getProperties\|webhook" src/routes/ --include="*.ts"`
2. Search: `grep -rn "ElevenLabs\|convai\|ELEVEN_LABS" src/ --include="*.ts" -l`
3. If no server-side tool registry is found, check the Marcela/Convai admin config route (`routes/admin/intelligence.ts`) for how tools are configured and pushed to ElevenLabs

Once you locate where tools are registered, add a `getReferenceBrands` webhook tool following the same pattern as existing tools. The tool response should call `storage.getReferenceBrands()` and return a compact JSON summary (max 25 brands, fields: `brandName`, `niche`, `adrUsd`, `occupancyPct`, `revparUsd`, `propertyCount`, `geographicFocus`).

**Acceptance criteria for Gap 4:**
- Marcela/Gustavo can invoke `getReferenceBrands` during a voice conversation turn
- The tool returns structured brand data without exposing admin-only refresh surfaces
- Existing webhook tools (`getProperties`, etc.) are unchanged

---

## Invariants to preserve

1. `mgmt-co-funding-prompt-input-builder.ts` **must stay pure** — no DB, no storage, no HTTP imports (ADR-007 §1)
2. `research-tool-prompts.ts` tool handlers should be pure where possible; `get_reference_brands` is the one async exception, accessed via DI `deps` pattern
3. `handleToolCall`'s existing signature callers must get a safe default — the new `deps?` param is optional; legacy callers work unchanged
4. KB reindex (`indexKnowledgeBase`) is already hooked — do not add a second call path from `researchReferenceBrands`; risk of double-write
5. Specialist persona names: use `humanName` strings (Gustavo, Ana, Bia…), never role strings in any user-facing copy you touch
6. No new DB migrations needed — `reference_brands` table and schema are fully in place

---

## Verification commands

Run these before declaring done:

```bash
# Type check the full server package
pnpm --filter @workspace/api-server run typecheck

# Confirm the KB includes reference brands chunks
curl -s localhost:80/api/admin/system-intelligence-status | jq .knowledgeBase

# Confirm the specialist tools surface lists get_reference_brands
curl -s localhost:80/api/admin/specialist-tools | jq '.tools | map(.id) | sort'

# Confirm reference brands table has data
curl -s localhost:80/api/admin/analyst-tables/reference_brands | jq '.summary'
```

---

## What this handoff does NOT include

- UI changes — `ReferenceBrandsGrid.tsx` already shows the cards; no additional frontend work
- New DB migrations — the schema is finalized
- Changes to the analyst-tables refresh pipeline — the GPT-4o batch refresh is complete
- Gap 3 (KB) — already done; do not modify `knowledge-base.ts` or `kb-content.ts` for this wiring
- Refactoring any existing specialist or any existing research tool handler
- Any changes to the `mgmt-co.funding` specialist catalog entry in `engine/analyst/registry/specialist-catalog.ts`

---

## Definition of done

- All three gaps implemented (Gap 1 research DI tool, Gap 2 funding prompt context, Gap 4 Marcela webhook)
- `pnpm --filter @workspace/api-server run typecheck` exits 0
- A commit on main with message footer: `handoff: reference-brands-orchestrator-specialists complete`
- Note appended to `docs/handoffs/reference-brands-orchestrator-specialists.md` (this file) with: date, what was implemented, any deviations

---

## Architecture reference files

- `artifacts/api-server/src/ai/aiResearch.ts` — interactive research loop
- `artifacts/api-server/src/ai/research-resources.ts` — tool schema registry
- `artifacts/api-server/src/ai/research-tool-prompts.ts` — tool call handlers
- `artifacts/api-server/src/ai/specialists/mgmt-co-funding-prompt-input-builder.ts` — ADR-007 pure builder
- `artifacts/api-server/src/ai/kb-content.ts` — KB chunk formatters (Gap 3 done here)
- `artifacts/api-server/src/ai/knowledge-base.ts` — KB indexer (Gap 3 done here)
- `artifacts/api-server/src/storage/intelligence/constants/watchdog.ts` — all reference brand storage methods
- `.claude/rules/` — check for any new rules files before touching the specialist/analyst layer
- `docs/architecture/` — ADR-007 and related
- `.agents/skills/marcela-ai-system/SKILL.md` — Marcela architecture overview
- `.agents/skills/specialist-persona-naming/SKILL.md` — persona naming rules (mandatory)
