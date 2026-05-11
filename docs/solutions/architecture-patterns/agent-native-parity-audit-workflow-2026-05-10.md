---
title: "Agent-Native Parity Audit and Tool Addition Workflow"
date: 2026-05-10
category: docs/solutions/architecture-patterns/
module: agent-native-systems
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "Launching a new agent-native feature and need to measure tool parity vs UI workflows"
  - "Discovering action-parity or CRUD gaps in Rebecca (e.g., agent can write but not read a resource)"
  - "After shipping significant UI features that haven't yet had Rebecca tool equivalents added"
tags:
  - agent-native
  - parity-audit
  - rebecca-tools
  - data-changed-entry
  - sse-invalidation
  - tool-addition
  - crud-completeness
related_components:
  - assistant
  - frontend_stimulus
---

# Agent-Native Parity Audit and Tool Addition Workflow

## Context

H+ Analytics had accumulated invisible parity gaps: some Rebecca tools could write data but not read it back, some UI actions had no agent equivalent, and new entity types weren't properly wired through the SSE invalidation system. These gaps were discovered reactively — an agent failed a task, an engineer fixed it — rather than proactively. There was also no standard pattern for adding tools, making each addition error-prone (missing one of four required changes breaks typecheck or the CI parity guard).

The existing `docs/solutions/architecture-patterns/rebecca-agent-native-architecture-2026-05-09.md` covers **how** tools execute (dispatch, functions, DataChangedEntry). This document covers **when and how to identify gaps and add tools systematically**.

## Guidance

### Step 1: Run the audit

Invoke `/ce-agent-native-audit` — it launches 8 parallel subagents, one per dimension:

| # | Dimension | What it measures |
|---|---|---|
| 1 | Action Parity | User UI actions that Rebecca can accomplish |
| 2 | Tools as Primitives | Atomic vs workflow tool classification |
| 3 | Context Injection | System prompt completeness |
| 4 | Shared Workspace | Agent and user operating in same data space |
| 5 | CRUD Completeness | Every entity has Create + Read + Update + Delete |
| 6 | UI Integration | `dataChanged` SSE flow wiring |
| 7 | Capability Discovery | Help, chips, empty-state visibility |
| 8 | Prompt-Native Features | Behavior defined in prompts vs code |

Each returns a score (X/Y, percentage). The orchestrator compiles a ranked table. H+ baseline (2026-05-09): 69% overall, with CRUD Completeness at 27% and Action Parity at 71% being the primary gaps.

### Step 2: Prioritize gaps

From the scored table, classify into three tiers:

- **Quick wins** — read gaps where the agent writes but cannot verify what it wrote. Low effort (no SSE wiring), high trust impact. Example: adding `get_global_assumptions` when `update_global_assumptions` already exists.
- **Action parity** — routes with obvious storage method equivalents not yet exposed to Rebecca. Medium effort. Example: `share_scenario` mirroring `POST /api/scenarios/shares`.
- **Structural** — new `entityType` values requiring SSE handler updates in both RebeccaPanel blocks. Higher effort. Example: `update_company` emitting `"company"` entityType.

Address quick wins and action parity first, then structural.

### Step 3: Add each tool (four-part pattern)

Every Rebecca tool requires exactly four coordinated changes. Since the
2026-05-10 file split, the parts live in **three different files** under
`artifacts/api-server/src/chat/` (plus a doc edit). Missing any one breaks
typecheck or the CI parity guard.

| Part | File | Symbol |
|---|---|---|
| A — Tool schema | `rebecca-tool-defs-<domain>.ts` (re-exported via `rebecca-tool-definitions.ts`) | `getRebeccaTools()` array entry |
| B — Dispatch case | `rebecca-tool-dispatch.ts` | `dispatchRebeccaTool()` switch |
| C — Implementation | `rebecca-tool-impls-<domain>.ts` | `tool*()` function |
| D — Parity row | `docs/discipline/agent-native-parity-map.md` | Markdown table row |

Pick `<domain>` from the existing impl files: `property`, `scenario`, `deck`,
`slide-factory`, `iris`, `kb`, `admin`. If a tool spans two domains, prefer
the impl file where most of its data lives and add an import to the dispatch.

**Part A — Tool schema** (in the appropriate `rebecca-tool-defs-<domain>.ts`):
```typescript
{
  name: "get_global_assumptions",
  description:
    "Read the current global assumptions for this organisation. Use before calling update_global_assumptions to see the current values.",
  parameters: { type: "object", properties: {} },
},
```

**Part B — Dispatch case** (in `dispatchRebeccaTool()` switch):
```typescript
case "get_global_assumptions":
  return await toolGetGlobalAssumptions(ctx);
```

**Part C — Implementation function** (in `rebecca-tool-impls-admin.ts` for this
example; pick the impl file matching the dispatch case's domain). `ToolContext`
and `DataChangedEntry` are imported from `./rebecca-tool-types`:
```typescript
async function toolGetGlobalAssumptions(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  // Admin-only: add requireAdminCtx check at top if needed
  const ga = await storage.getGlobalAssumptions(ctx.userId);
  if (!ga) return { result: { error: "Global assumptions not found" } };
  return { result: ga };
  // Read tools: omit dataChanged. Write tools: include it.
}
```

**Part D — Parity map row** (in `docs/discipline/agent-native-parity-map.md`):
```markdown
| Read global assumptions | Admin → Defaults (view) | `get_global_assumptions` | ✅ |
```

Verify all four before committing — the CI test (`parity-map-coverage.test.ts`) catches missing Part D.

### Step 4: Wire new entityTypes (for mutating tools that emit new events)

When a tool emits a `dataChanged` with an `entityType` not already in the union, three additional changes are required:

**In `rebecca-tool-types.ts` — extend the `DataChangedEntry` union**:
```typescript
export type DataChangedEntry = {
  entityType: "property" | "scenario" | ... | "company" | "market_rate";
  entityId: number;
};
```

**In `RebeccaPanel.tsx` — add handler in BOTH SSE blocks**. There are two blocks (one per streaming mode, currently ~lines 468 and 662 — search for `entry.entityType === "property"` to locate them). Both must be updated or one mode leaves the UI stale:
```typescript
} else if (entry.entityType === "company") {
  queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
} else if (entry.entityType === "market_rate") {
  queryClient.invalidateQueries({ queryKey: ["/api/market-rates"] });
}
```

The React Query key must match whatever `useQuery` the relevant UI component uses. Check the frontend component to find the exact key before writing the handler.

### Step 5: Verify

```bash
pnpm run typecheck                                          # must be clean
pnpm --filter @workspace/api-server run test -- \
  src/tests/parity-map-coverage.test.ts                    # must pass
```

The parity map test extracts every `name:` from `rebecca-tools.ts` and verifies each appears as a backtick-quoted identifier in `docs/discipline/agent-native-parity-map.md`. It catches omitted Part D silently.

## Why This Matters

**Reactive vs proactive**: Without the audit, parity gaps surface when an agent fails a task. The audit makes them visible upfront.

**Read-before-write gaps are a trust issue**: If an agent can call `update_global_assumptions` but not `get_global_assumptions`, it operates blind — it updates values it cannot verify. Read tools are typically two-line implementations with no SSE wiring and close this immediately.

**Two-block SSE requirement**: `RebeccaPanel.tsx` has two SSE handler code paths (streaming vs non-streaming). Updating only one leaves the UI stale in the other mode — a class of bug that only manifests depending on the user's response mode setting. The two-block requirement is non-obvious; this doc establishes it as a hard rule.

**CI parity guard prevents silent omissions**: The `parity-map-coverage.test.ts` test ensures every tool ships with documentation. Without it, tools accumulate without audit trail.

## When to Apply

- Before designing new agent capabilities — run the audit to see inherited parity gaps.
- After shipping significant UI features — check whether corresponding Rebecca tools exist.
- When a user reports "Rebecca should be able to do X" — run the audit and locate which dimension covers X.
- Quarterly — re-run to measure progress and identify the next highest-ROI gaps.

## Examples

**Actual tools added in Phase 1+2 (2026-05-10):**

| Tool | Gap closed | SSE entityType | Notes |
|---|---|---|---|
| `get_global_assumptions` | Quick win: read before write | None (read) | 2-line implementation |
| `list_kb_entries` + `get_kb_entry` | CRUD Read on KB | None (read) | `list_kb_entries` is admin-only, matching route |
| `share_scenario` | Action parity | `"scenario"` (already existed) | Mirrors full route incl. email notifications |
| `delete_property_photo` + `set_hero_photo` | Action parity | `"property"` (already existed) | Last-photo guard mirrored from route |
| `update_company` | CRUD Update on companies | `"company"` (new) | Uses Drizzle direct import — no storage method exists |
| `get_market_rates` + `update_market_rate` | Action parity | `"market_rate"` (new) | Market rates use a data layer, not storage.* |
| Fix `trigger_lb_deck_render` | UI Integration: silent mutator | `"lb_deck_config"` (existed) | One-line return value fix |

## Related

- `docs/solutions/architecture-patterns/rebecca-agent-native-architecture-2026-05-09.md` — Technical blueprint of the tool dispatch system, DataChangedEntry, SSE streaming. Read this before implementing.
- `docs/solutions/architecture-patterns/mcp-integration-surfaces-production-vs-claude-code-2026-05-08.md` — Why production tools require full wiring in `rebecca-tools.ts` (not just `.mcp.json`).
- `docs/solutions/architecture-patterns/sse-streaming-react-component-lifecycle-2026-05-08.md` — SSE lifecycle and the RebeccaPanel state management that consumes `dataChanged` events.
- `docs/solutions/conventions/react-query-apiRequest-querykey-convention-2026-05-05.md` — How to find the correct React Query key to invalidate for each entityType.
- `docs/discipline/agent-native-parity-map.md` — The live parity map every tool must be documented in.
