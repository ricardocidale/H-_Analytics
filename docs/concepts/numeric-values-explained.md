# Numeric values in H+ Analytics — a readable explanation

> Where do numbers live? Why? What's enforced, and how?
> This is the human-readable companion to CLAUDE.md §1–§3, the
> `hplus-variable-taxonomy` skill, and the numeric architecture brainstorm.
> If you only read one doc on this topic, read this one first.

---

## The one-sentence version

**Every number in this codebase belongs to exactly one of five categories, and four of those five categories forbid you from writing it as a TypeScript literal.** A CI gate (`check-magic-numbers.ts`) enforces this on every commit.

---

## Why we care this much

A hardcoded number is a lie that compiles. It looks like a value but it's actually three things at once:

1. **A value** — what the engine reads
2. **A decision** — somebody (a programmer) decided this is the right number
3. **A claim** — that nobody else needs to see, change, or research it

When a financial assumption is hardcoded as `0.085`, it means the engine works, but:

- The admin can't change it without a code deploy
- Nobody knows where the `0.085` came from (which research? which date?)
- It silently stays `0.085` for years while the market moves
- Different files end up with `0.085` in some places and `0.09` in others
- The Analyst agent has nothing to research, propose, or update

So we split numbers by **what kind of decision they represent**, and put each kind in the place where that kind of decision lives.

---

## The five categories

| # | Name | Lives in | Example | Who decides? |
|---|------|----------|---------|--------------|
| 1 | TRUE CONSTANTS | TypeScript | `DAYS_PER_MONTH = 30.5` | Math / physics |
| 2 | DEFAULT VARIABLES | **NOWHERE** (legacy) | `DEFAULT_EXIT_CAP_RATE = 0.085` | (forbidden) |
| 3 | ASSUMPTION VARIABLES | DB row on the entity | `property.exitCapRate` | The user, per property |
| 4 | TABLE-SOURCED VALUES | `market_rates` table | `getMarketRate('transfer_tax_us')` | Analyst research |
| 5 | STARTER-PORTFOLIO SEEDS | Migration SQL + `seeds/` | `SEED_MEDELLIN_DUPLEX_START_ADR` | Calibrated, one-time |

Five categories. No sixth. If a number doesn't fit one of these, you're holding it wrong.

### Category 1 — TRUE CONSTANTS

The universe decided these, not us.

```ts
const DAYS_PER_MONTH = 30.5;        // 365 / 12
const SECONDS_PER_DAY = 86400;      // 60 * 60 * 24
const PI = Math.PI;
```

Allowed in TypeScript. Comment must show the derivation if it isn't obvious. These never change unless physics changes.

Also allowed: **structural clamps and indices** (`0`, `1`, `-1`) — array indices, "first item", "negative means error". They aren't decisions, they're how code is written.

Also allowed: **algorithm calibration constants** — IRS/GAAP-derived engine parameters like `NOL_UTILIZATION_CAP = 0.8` (federal tax law says 80%), rule-ordering integers like `PRIORITY_TIER_A = 100`. These are non-financial and non-admin-configurable. If somebody could plausibly want to change it via the admin UI, it isn't this category.

### Category 2 — DEFAULT VARIABLES (LEGACY DEBT)

The category we used to have. Now banned.

```ts
// VIOLATION — looks "named" so feels safe, but it's the same lie
export const DEFAULT_EXIT_CAP_RATE = 0.085;

const exitCap = property.exitCapRate ?? DEFAULT_EXIT_CAP_RATE;
```

Wrapping a hardcoded number in a `const` doesn't change the fact that **a programmer decided 0.085 was the right number for everyone, with no source, no review, no Analyst, no admin control**. The name makes it worse — it disguises the decision.

We are slowly retiring every `DEFAULT_*` constant in the codebase. As of session 20, 14 have been retired and ~3 are explicitly blocked pending Phase 2 of the architecture (see "What's paused" below).

### Category 3 — ASSUMPTION VARIABLES (per-entity DB columns)

The bread and butter. Every property, every company, every scenario has its own values stored as columns on its row.

```ts
// Engine just reads — no fallback, no ??
const exitCap = property.exitCapRate;
```

**No `?? DEFAULT_*`.** The three-layer resolver guarantees the column is populated at entity creation:

1. **Layer 1** — `model_defaults` table (universal fallback, admin-editable)
2. **Layer 2** — matching `icp_brackets` row overlays (e.g., "luxury-hotel" vs "upscale-str")
3. **Layer 3** — copy into the entity column (`property.exitCapRate`)

By the time the engine reads `property.exitCapRate`, it is always set. NOT NULL DEFAULT in the migration enforces it at the schema level. Fallback constants aren't just stylistically bad — they're structurally unnecessary.

### Category 4 — TABLE-SOURCED VALUES (authority rates)

Rates that change over time, sourced from external authorities (IRS publications, FRED data, lender quotes). These live in dedicated tables.

```ts
// Route layer fetches
const rate = await getMarketRate('transfer_tax_us');

// Engine receives as a pure parameter
computeExitScenarios({
  transferTaxRates: { transfer_tax_us: rate.value / 100 },
});
```

Stored in `market_rates`, refreshed by an Analyst-driven process, surfaced in the admin UI with last-regenerated timestamps and freshness dots (green/yellow/red).

**ADR-007 (§4 of CLAUDE.md):** the engine and calc layers must NEVER import storage, DB, or logger. The route layer fetches; pure calc functions receive the values as parameters. This is the "DI discipline" rule — keeps the financial engine deterministic and testable.

### Category 5 — STARTER-PORTFOLIO SEEDS (calibrated bootstrap)

The exception that proves the rule. Numbers that calibrate the dev database and the prod starter portfolio at first launch.

```ts
// In artifacts/api-server/src/seeds/medellin-duplex.ts
const SEED_MEDELLIN_DUPLEX_START_ADR = 145;
// Source: Tripadvisor/Airbnb survey 2026-04-15
// Target: 65% occupancy, $9.4k/mo revenue
// Runbook: docs/runbooks/starter-portfolio-calibration.md
```

Allowed only in dedicated bootstrap surfaces — never imported by runtime engine/calc/route code. Mandatory:
- `SEED_` prefix (or inline literal with provenance comment)
- Source citation: date, target metric, runbook link
- On prod-DB conflict, the DB row wins (`onConflictDoNothing()`)

These exist because "bootstrap a fresh database with a believable demo" is a real problem with no good place to put numbers other than "right next to the bootstrap code." The carve-out is narrow: specific files, prefix-enforced, never re-imported at runtime.

Allowed locations (the CI checker skips these):
- `artifacts/api-server/src/migrations/*.ts`
- `artifacts/api-server/src/seeds/**`
- `artifacts/api-server/script/seed-*.ts`
- `artifacts/api-server/src/syncHelpers.ts`
- `lib/shared/src/constants.ts` — cross-package `SEED_*` only

---

## Integration identifiers (the parallel rule)

Same logic, different shape. Model names, API slugs, MCP slugs, endpoint URLs — never as string literals or string constants in source.

```ts
// VIOLATION
const MODEL = "claude-sonnet-4-6";
const ENDPOINT = "https://api.example.com/v1/extract";

// CORRECT
const provider = await db.getAdminResource({ kind: 'model', slot: 'bulk-text' });
const model = provider.config.modelId;
```

They live in `admin_resources` rows, fetched at runtime. Same reason as financial values: somebody needs to swap them without a deploy, somebody needs to research and approve the swap, and you don't want different files holding different versions of the same identifier.

| Integration type | `admin_resources kind` | Runtime path |
|---|---|---|
| LLM models / providers | `model`, `llm_slot` | `GET /api/llm-providers` |
| External APIs (Exa, Perplexity, …) | `api` | query by `config` flag |
| MCP servers | `mcp` | query filtered by `kind='mcp'` |
| Endpoint URLs | `config.endpoint` on the row | read from the row |

---

## How enforcement works

### The hard gate

```bash
scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts
```

Runs in CI on every PR. Scans every TypeScript file for numeric literals and string literals matching the banned patterns. Has a "ratchet" — a baseline file recording the current set of known suspects. A PR passes if it doesn't ADD new suspects.

The ratchet only moves in one direction: **down**. You can retire suspects; you can't add them.

### The category-2 superseding rule

```ts
// All three are the same violation
property.exitCapRate ?? 0.085
property.exitCapRate ?? DEFAULT_EXIT_CAP_RATE
const DEFAULT_EXIT_CAP_RATE = 0.085
```

Names don't fix decisions. The checker catches all three.

### The seed file rule

TS seed scripts MUST NOT carry financial literals. They invoke the resolver (`POST /api/properties`) which populates values from `icp_brackets` Layer 2.

```ts
// CORRECT
await createProperty({ companyId, ...baseFields });

// VIOLATION
{ exitCapRate: 0.075 }
```

Per-entity confirmed overrides go through a SQL migration, never a TS constant.

### Test files

`*.test.ts` and `*.spec.ts` are exempt from the gate. Tests need fixed values to assert against.

---

## The three-pillar mental model

Once you've internalized the rule, the architecture itself is simple:

```
                  ┌─────────────────────────────────────┐
                  │  TypeScript code (engine + calc)   │
                  │                                     │
                  │   Reads pure inputs only            │
                  │   • Cat 1 constants (math)         │
                  │   • Function parameters             │
                  │   • Entity columns (Cat 3)         │
                  └─────────────────────────────────────┘
                              ▲
                              │ pure parameters
                              │
                  ┌─────────────────────────────────────┐
                  │  Route / service layer              │
                  │                                     │
                  │   Resolves at request time:         │
                  │   • Cat 4 from market_rates         │
                  │   • Cat 3 from entity row           │
                  │   • Cat 2 NEVER (banned)            │
                  └─────────────────────────────────────┘
                              ▲
                              │ DB reads
                              │
                  ┌─────────────────────────────────────┐
                  │  PostgreSQL                          │
                  │                                     │
                  │   model_defaults (Layer 1)          │
                  │   icp_brackets (Layer 2)            │
                  │   properties / companies (Layer 3) │
                  │   market_rates (authority data)     │
                  │   admin_resources (integrations)    │
                  └─────────────────────────────────────┘
                              ▲
                              │ Analyst research
                              │
                  ┌─────────────────────────────────────┐
                  │  Analyst agent (Phase 2 — pending)  │
                  │                                     │
                  │   Researches → proposedValue        │
                  │   Admin accepts → lastSetSource     │
                  │     = 'analyst_accepted'            │
                  └─────────────────────────────────────┘
```

Each layer only knows about the layer above and below it. The engine is deterministic and pure. The DB is the source of truth. The Analyst is the source of *decisions*.

---

## What's paused (status as of 2026-05-18)

We do not yet have an Analyst agent that researches `model_defaults` rows. Every row in `model_defaults` is currently `lastSetSource='seed'` — meaning a programmer guessed it. They're debt markers waiting for Phase 2.

Until Phase 2 ships, **the §2 T1-4 campaign is paused**. Three `DEFAULT_*` constants are deliberately NOT being retired:
- `DEFAULT_ADR_GROWTH_RATE`
- `DEFAULT_TRAVEL_COST_PER_CLIENT`
- `DEFAULT_IT_LICENSE_PER_CLIENT`

Why: retiring them prematurely would mean replacing a named constant with an inline literal in `computePropertyDefaults`, which is the WORSE form of the same violation. The right path is:

1. Wire `computePropertyDefaults` to receive `model_defaults` card values from the route layer (no DB access in the engine — ADR-007)
2. Build the Analyst agent that researches `model_defaults` rows
3. Then retire the TS constants — values now flow Analyst → DB → route → engine

Phase 2 design is captured in `docs/brainstorms/numeric-architecture-requirements.md` (decisions D1–D5).

---

## Quick decision tree

When you're about to write a number, ask:

1. **Is it math/physics?** → Cat 1, write as named TS constant with derivation comment
2. **Is it `0`, `1`, or `-1` used as an index/clamp?** → write it inline
3. **Is it an IRS/GAAP/algorithm-internal calibration constant?** → Cat 1, named TS constant
4. **Is it a financial value somebody might want to research, change, or audit?**
   - Per-entity? → Cat 3, DB column, three-layer resolver
   - System-wide authority rate? → Cat 4, `market_rates` table, fetched in route
5. **Is it a bootstrap value for the demo portfolio?** → Cat 5, `SEED_*` in dedicated surface, with source comment
6. **Is it a model name, slug, or endpoint URL?** → `admin_resources` row, fetched at runtime
7. **None of the above?** → You're holding it wrong. Pick again.

---

## Reference index

| Topic | Location |
|---|---|
| The rules (enforcement contract) | `CLAUDE.md` §1, §2, §3, §4, §5 |
| The taxonomy skill (full detail) | `.agents/skills/hplus-variable-taxonomy/SKILL.md` |
| The magic-numbers checker | `scripts/src/check-magic-numbers.ts` |
| The Cat 5 carve-out doc | `docs/solutions/conventions/category-5-starter-portfolio-seeds-carve-out-2026-05-18.md` |
| The Phase 2 brainstorm | `docs/brainstorms/numeric-architecture-requirements.md` |
| The `model_defaults` schema | `lib/db/src/schema/model-defaults.ts` |
| The three-layer resolver | search "computePropertyDefaults" |
| ADR-007 (DI discipline) | `CLAUDE.md` §4, `references/adr-007-*` |
