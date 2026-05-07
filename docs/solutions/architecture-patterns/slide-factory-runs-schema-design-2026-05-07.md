---
title: "slide_factory_runs schema: status-only tracking, FK columns for property assignments, DB-level CHECK on status"
date: 2026-05-07
category: architecture-patterns
module: slide-factory-v2
problem_type: architecture_pattern
component: database
severity: high
applies_when:
  - Designing a resumable pipeline run table with per-stage state
  - Deciding between JSONB and FK columns for snapshotted foreign IDs
  - Choosing between a tab/step integer and a status enum for pipeline position
tags:
  - slide-factory
  - slide-factory-runs
  - database-schema
  - status-tracking
  - foreign-keys
  - check-constraint
  - jsonb-vs-fk
  - pipeline-state
---

# slide_factory_runs schema: status-only tracking, FK columns for property assignments, DB-level CHECK on status

## Context

Designing the `slide_factory_runs` table for the LB slide factory V2 pipeline. The table tracks resumable state across 6 tabs: Brief (Tab 1), Lorenzo ingestion (Tab 2), Property assignment (Tab 3), Lucca draft (Tab 4), Agent build (Tab 5), Download (Tab 6). Three architectural questions arose that required advisor review before writing the migration SQL.

## Guidance

**Decision 1 — No `currentTab` column. Status alone encodes pipeline position.**

Use a rich status enum that maps 1:1 to pipeline stages. A `currentTab` integer alongside a `status` enum is two sources of truth for the same fact — they drift.

```ts
// ✅ 9-value status enum — tab is derivable, not stored
export const SLIDE_FACTORY_RUN_STATUSES = [
  "new",         // Tab 1: brief not yet submitted
  "brief_ready", // Tab 1: brief accepted, Lorenzo not started
  "ingesting",   // Tab 2: Lorenzo running
  "ingested",    // Tab 3: property assignment ready
  "drafting",    // Tab 4: Lucca running
  "draft_review",// Tab 4: awaiting admin slot approval
  "building",    // Tab 5: slide teams running
  "complete",    // Tab 6: deck downloadable
  "error",       // Any: fatal failure
] as const;

// ❌ Don't do this — currentTab and status will drift
{ currentTab: integer, status: text }
```

**Decision 2 — Property assignments as FK integer columns, not JSONB.**

The four slide property IDs (slides 1, 2, 3, 5) are snapshotted at Tab 3. Use four FK columns with `ON DELETE SET NULL` rather than a JSONB object.

```sql
-- ✅ FK columns: automatic null-out when a property is deleted mid-run
slide1_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
slide2_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
slide3_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
slide5_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,

-- ❌ JSONB silently keeps dangling IDs when a property is deleted
property_assignments JSONB  -- { slide1PropertyId: 42, ... }
```

The JSONB approach loses `ON DELETE SET NULL` behavior. When a property is deleted while a paused run references it, the FK columns null out cleanly; JSONB silently retains a dangling integer. The run-resume path detects nulled FK columns and surfaces a recoverable "property was deleted" error.

**Decision 3 — DB-level CHECK constraint on status, not just TypeScript types.**

```sql
-- ✅ CHECK constraint enforces valid values at the DB layer
status TEXT NOT NULL DEFAULT 'new'
  CHECK (status IN (
    'new', 'brief_ready', 'ingesting', 'ingested',
    'drafting', 'draft_review', 'building', 'complete', 'error'
  )),

-- ❌ Text-only with TypeScript $type<> — DB accepts any string
status TEXT NOT NULL DEFAULT 'new'
```

LLM tool calls (Rebecca, agent pipelines) can produce arbitrary strings. A CHECK constraint is one additional SQL line that prevents `"INGESTING"` (case typo) or `"in-progress"` (hallucinated value) from landing silently. TypeScript's `.$type<>()` is compile-time only.

## Why This Matters

- **Status drift**: A run where `currentTab=3` but `status="new"` is inconsistent state that every reader must defensively handle. A single status enum eliminates the class.
- **Dangling FK references**: A paused run referencing a deleted property silently points at nothing with JSONB. FK columns surface this as a detectable null at resume time.
- **DB integrity**: Pipeline agent code is increasingly LLM-mediated. CHECK constraints are the last line of defense against bad status values that would corrupt run state.

## When to Apply

- Any resumable pipeline table where position is encoded as both a step number and a state string — collapse to one.
- Any table that snapshots FK IDs for later use — prefer FK columns over JSONB for scalar IDs (4 or fewer).
- Any table written by agent/LLM code — add CHECK constraints on enumerated string columns.

## Examples

```sql
-- Final slide_factory_runs status column
status TEXT NOT NULL DEFAULT 'new'
  CHECK (status IN (
    'new', 'brief_ready', 'ingesting', 'ingested',
    'drafting', 'draft_review', 'building', 'complete', 'error'
  )),
```

```ts
// Drizzle schema — $type<> for TS safety in addition to DB CHECK
status: text("status")
  .notNull()
  .default("new")
  .$type<SlideFactoryRunStatus>(),
```

## Related

- `lib/db/src/schema/slide-factory-runs.ts` — the implemented schema
- `artifacts/api-server/migrations/0041_slide_factory_runs.sql` — the migration
- `docs/solutions/architecture-patterns/slide-factory-financial-data-fork-diagnostic-vs-packaging-2026-05-06.md` — related slide factory architecture decisions
