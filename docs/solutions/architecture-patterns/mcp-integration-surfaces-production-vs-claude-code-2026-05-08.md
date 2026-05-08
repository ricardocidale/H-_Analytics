---
title: "MCP servers in .mcp.json are Claude Code tools only — not production integrations"
date: 2026-05-08
category: architecture-patterns
module: mcp-integration
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - Adding a new external data source (financial API, hotel data, search provider)
  - Deciding how to wire an MCP server into H+ Analytics
  - Planning how Rebecca or research specialists should access external data
tags:
  - mcp
  - mcp-json
  - production-vs-development
  - rebecca-tools
  - external-data-sources
  - agent-native
---

# MCP servers in .mcp.json are Claude Code tools only — not production integrations

## Context

During a session adding financial and hospitality MCPs (FRED, Booking.com, Exa, Daloopa, FMP,
Expedia), all were placed in `.mcp.json`. The user then asked "which ones did you bring into the
codebase? How?" — revealing that `.mcp.json` only wires MCP tools for the AI assistant (Claude
Code) during development sessions. Production users, Rebecca, and the research specialists never
see them.

The confusion is easy to make: the `.mcp.json` file is in the repo root, committed to git, and
reads from the same environment secrets as production. It looks like a production config. It is
not.

## Guidance

### Two entirely separate surfaces

```
┌─ Claude Code session (.mcp.json) ──────────────────────────────────────┐
│ You (developer) → Claude Code → MCP tools → AI can query live data     │
│ while CODING. Helps the AI assistant, not the product.                 │
└────────────────────────────────────────────────────────────────────────┘

┌─ Production H+ Analytics ───────────────────────────────────────────────┐
│ User → Rebecca → rebecca-tools.ts → API call → DB cache → UI          │
│ Requires real engineering: new Rebecca tools, fetchers, DB tables.     │
└────────────────────────────────────────────────────────────────────────┘
```

**`.mcp.json` wires external data to the AI assistant's tool-calling during development.**
It does nothing for production users.

### What production integration requires

For each external data source to reach production users, all of the following must be built:

1. **Rebecca tool** in `artifacts/api-server/src/chat/rebecca-tools.ts` — a `case` in the
   switch dispatcher, a tool definition in the `REBECCA_TOOLS` array, and an implementation
   function that calls the external API
2. **Parity map entry** in `docs/discipline/agent-native-parity-map.md` — per CLAUDE.md §7
3. **DB caching** — a table (or rows in `admin_resources`) to cache external responses so the
   product isn't directly coupled to third-party uptime
4. **Scheduled fetcher** (optional but recommended) — an ambient-fetcher or scheduler job that
   pre-fetches and caches data on a schedule, so Rebecca reads from the cache rather than waiting
   for a live API call on every user request
5. **Admin visibility** — an `admin_resources` row so the Sources section can show health status

### The existing template: FRED

FRED is the canonical example of a correctly-integrated external source in H+:
- `FRED_API_KEY` set in environment
- `ambient-fetcher` (`artifacts/api-server/src/ai/ambient/fetchers.ts`) fetches FRED series
  on a schedule and stores results in the `market_benchmarks` table
- `getFactoryNumber()` reads from the DB cache — the financial engine never calls FRED directly
- Admin → Sources shows FRED as a monitored resource

New MCPs should follow this pattern: fetch externally on a schedule, cache in DB, serve from cache.

### What .mcp.json IS useful for

During Claude Code sessions, `.mcp.json` MCPs give the AI assistant access to live data while
helping you build. Examples of legitimate uses:
- Query FRED for current rates while writing financial engine constants
- Search Booking.com for example hotel data while building data models
- Use Exa to research competitor products while designing new features
- Use Daloopa to look up REIT financials while writing benchmarking logic

This is valuable for development assistance — it just doesn't reach production users.

## Why This Matters

Conflating the two surfaces leads to:
- Shipping `.mcp.json` additions under the assumption they improve the product for users
- Missing the actual engineering work (Rebecca tools, fetchers, DB tables) required for
  production data access
- Agent-native parity gaps (§7) — the UI has data that Rebecca cannot access

The distinction is especially important in H+ because the research specialists, Rebecca, and the
financial engine all need data from the same external sources. Each needs a proper server-side
integration, not a Claude Code config file.

## When to Apply

Apply this decision map for every new external data source:

| Goal | Use |
|------|-----|
| AI assistant can query the source while I code | `.mcp.json` only |
| Production users see data in the UI | DB table + fetcher + Rebecca tool |
| Rebecca can use the data in conversations | Rebecca tool in `rebecca-tools.ts` |
| Admin can monitor the source health | `admin_resources` row + probe |
| Research specialists can use it | Tool available via Gustavo's `handleToolCall` |

## Examples

### Wrong — wires for Claude Code only, production users see nothing

```json
// .mcp.json
{
  "mcpServers": {
    "daloopa": {
      "type": "http",
      "url": "https://mcp.daloopa.com/server/mcp",
      "headers": { "X-API-KEY": "${DALOOPA_API_KEY}" }
    }
  }
}
```

### Right — Rebecca tool that wraps the external call and caches the result

```ts
// artifacts/api-server/src/chat/rebecca-tools.ts
case "get_reit_financials":
  return await toolGetReitFinancials(args, ctx);

async function toolGetReitFinancials(args, ctx) {
  // 1. Check DB cache first
  const cached = await storage.getReitFinancials(args.ticker);
  if (cached && !isCacheStale(cached)) return { result: cached };
  // 2. Call Daloopa (or FMP) directly from the server
  const data = await fetchDaloopaFundamentals(args.ticker);
  // 3. Store in DB
  await storage.upsertReitFinancials(args.ticker, data);
  return { result: data };
}
```

## Related

- `artifacts/api-server/src/ai/ambient/fetchers.ts` — FRED ambient fetcher (canonical template)
- `artifacts/api-server/src/chat/rebecca-tools.ts` — where Rebecca tools are implemented
- `docs/discipline/agent-native-parity-map.md` — parity tracking for every data surface
- `docs/solutions/architecture-patterns/rebecca-agent-native-architecture-2026-05-05.md`
- `.mcp.json` — Claude Code development session MCP config (not production)
