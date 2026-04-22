# Resources Control Plane

Status: Locked 2026-04-21. Live phase status: see `.claude/phases.md`.

## What this document covers

The architectural doctrine for Admin > Resources, the read-only Specialist
assignment surfaces in Admin > AI Research, the thin Admin > AI Platform
section, and the wiring policy that connects them. This document is the
authoritative reference for any agent or human extending the AI/Resources
admin surfaces.

For the user-facing IA narrative, see the `replit.md` block titled
"LOCKED 2026-04-21 (architect endorse-with-mods + 4 user confirmations)".

## Top-level Admin sidebar

```
Defaults | Resources | AI Platform | AI Research | (existing non-AI sections)
```

## Resources — canonical control plane

Resources is the **single canonical edit surface** for app-wide
infrastructure. Sub-pages are sibling categories (NOT subtypes):

| Sub-page    | Definition                                                                 |
|-------------|----------------------------------------------------------------------------|
| APIs        | Authenticated executable connectors (FRED, OpenAI, Anthropic, Stripe, …)   |
| Sources     | Content / feed / dataset origins (RSS, public CSVs, scrape targets, …)     |
| Tables      | Internal lookup / reference tables                                         |
| Benchmarks  | Comparison datasets                                                        |
| Models      | LLM model registry (vendor + model id + capabilities)                      |

Each Resource record is stored in a single canonical table (`admin_resources`,
P2). Edits are versioned with actor, diff, and rollback pointer
(`admin_resource_versions`, P2). **Secrets never live inline.** Each record
carries an optional `secretRef` pointing into the project's secret store;
runtime modules resolve it at call time.

## AI Platform — kept thin

AI Platform is deliberately small. It owns:

- **Universal LLM Uses** — non-Specialist LLM consumers. Rebecca chat
  (her prompt + model pick), generic embeddings, generic system prompts.
- **Routing & Fallback Policy** — cross-vendor failover rules, retry
  policy, cost guardrails.
- **Cross-vendor Observability** — latency / error / spend dashboards
  aggregated across all consumers (Specialists + Universal).

AI Platform does **not** own vendor keys or the model registry. Those moved
to Resources.

## AI Research — Specialist-first

Collapsible 2-level tree: `AI Research → Subject → Specialist`. Subjects:
Management Company, Property, Photos, Portfolio Ops.

The Specialist catalog at `engine/analyst/registry/specialist-catalog.ts` is
the single registry of which Specialists exist (currently 7), what subject
each belongs to, what page tabs each renders, and which canonical Resources
each is wired to.

### Specialist page tabs (capability-driven)

A Specialist page renders a tab iff it declares the matching capability:

| Capability                | Tab                       | Editability                                     |
|---------------------------|---------------------------|-------------------------------------------------|
| `required-fields`         | Required Fields           | Specialist-owned (editable here)                |
| `llm-config`              | LLM Config                | Specialist-owned: prompt + model selection      |
| `resource-assignments`    | Resource Assignments      | **Read-only**. Health dot + Test button.        |
| `runtime`                 | Runtime / Triggers        | Specialist-owned (cooldowns, schedule, …)       |
| `audit`                   | Audit                     | Read-only (recent runs, verdicts, evidence)     |
| `per-resource-overrides`  | Per-Resource Overrides    | Specialist-owned overrides; canonical untouched |

Model selection on the LLM Config tab is a **reference** into Resources >
Models — picking which registered model to use, not editing the model itself.

## Wiring authority — code-only with break-glass

The Specialist↔Resource link set is declared in
`engine/analyst/registry/specialist-catalog.ts` via each Specialist's
`assignmentRefs`. Adding or removing a link requires a code edit + PR + deploy.

A **break-glass override** (P2: `audit_break_glass_overrides` table,
super-admin-only, time-boxed, fully audited) exists for incident reroute —
e.g. swapping a dead vendor under fire. Every override surfaces a banner on
the affected Specialist page until the underlying catalog is patched.

Rationale: code-only wiring is git-reviewable, prevents accidental admin
rewiring that could silently break a Specialist, and keeps the assignment
graph diffable. Break-glass exists so on-fire ops are not blocked by deploy.

## Health-dot semantics

Background checker (`server/jobs/resource-health-checker.ts`, P3) probes
each resource on its kind's TTL and writes to `resource_health_checks`. The
Specialist page reads cached status and applies a **freshness band**:

| Band  | Color | Condition                                                  |
|-------|-------|------------------------------------------------------------|
| green | 🟢    | Last check OK AND `checkedAt` within TTL                   |
| amber | 🟡    | Last check OK BUT `checkedAt` past TTL — never green stale |
| red   | 🔴    | Last check failed                                          |
| gray  | ⚪    | Never checked / unknown                                    |

Stale-green is forbidden by design — a confidently-green dot pointing at a
dead vendor is worse than red.

## Test button semantics

Per-`ResourceKind` **probe profile** (`shared/schema/admin-resource.ts`
`ProbeProfileSchema`):

- **Idempotent** and **side-effect-free**: e.g. for an LLM API the probe is
  a `GET /v1/models` call, NOT a chat completion.
- **Cost-guarded**: each profile declares `maxCostUsd` (default `0.001`);
  the runtime fails fast if a probe would exceed the budget.
- **Rate-limited per resource per admin** (`rateLimitPerMinute`).
- **Fully audited**: every Test press writes actor, resource, result,
  latency, timestamp.

## Migration impact (P1 → P2 onward)

- P1 catalog (`SPECIALIST_CATALOG`) survives intact through P7.
- P2 builds the canonical tables and the catalog-sync job that materializes
  `assignmentRefs` into `specialist_assignments`.
- Existing `data_sources`, `LlmDefaultsTab`, and pipeline routes become
  seed inputs for Resources via P6 adapters; legacy tables remain as
  read-only mirrors through P7.

## Architecture evolution — why this doctrine, not the other two

This control plane is the **third** doctrine in less than 24 hours. The
prior two were rejected for specific reasons. ADR-006 captures the
decision in full; the short version:

- **v0 (pre-Apr 21) — AI section as flat registry.** Vendor keys, model
  picks, prompts, and benchmark links authored inline on a single Admin
  page. AI Research surfaces were thin reference wrappers. Worked for 2
  Specialists; the duplication failure mode (same FRED key copied into 5
  Specialists) made it untenable at 7.
- **v1 (Apr 21 morning) — Hub-and-spoke storage.** Each Specialist owns
  its own page; persistence is a many-to-many
  `specialist_resource_links` join; editing an API key inside Specialist
  A mutates the canonical row with an "also used by" impact list shown
  inline. Solved duplication. Did **not** solve wiring authority — an
  admin clicking through a Specialist page could silently rewire it away
  from the Resource its evaluator was tested against, with no PR trail.
- **v2 (current, LOCKED Apr 21) — this document.** Resources is the
  canonical control plane (one edit surface per Resource, versioned).
  Specialist pages are read-only for assignments (wiring is code-only via
  the Specialist catalog). Code-only wiring + super-admin-only audited
  time-boxed break-glass is the steady-state invariant + escape hatch
  combination.

The three forces v2 simultaneously resolved that v0 and v1 left open:
single canonical SoT per Resource, diffable wiring authority, and
audit-trail incident response.

## Phase status

**Live phase status for this workstream lives in `.claude/phases.md`** (single source of truth across the codebase). This document carries the architectural rationale; the phase tracker carries the per-phase commit / owner / blocked-by / next.

For directive rules + invariants + runbooks (add a `ResourceKind`, write a probe profile, etc.), see `.claude/skills/resources/SKILL.md`.

## P5 — Specialist read-only surface (concrete contract)

Per-Specialist mutable config storage:

- `specialist_configs` (one row per `specialistId`): prompt template,
  model resource id (FK → `admin_resources` of `kind=model`), required
  fields (string[] jsonb), runtime config (jsonb), version, audit cols.
- `specialist_config_versions` (append-only): snapshots the prior state
  at version N before applying the patch that produces N+1. Tagged with
  `section` ∈ `{llm-config, required-fields, runtime}` so the Audit tab
  can render "edited LLM Config" without diffing.

Routes (all `requireAdmin`, all in `server/routes/admin/specialists.ts`):

- `GET /api/admin/specialists` — catalog list with status
- `GET /api/admin/specialists/:id` — definition + config + assignments-with-health
- `PUT /api/admin/specialists/:id/llm-config` — prompt + modelResourceId; validates the model resource exists AND has `kind=model`; capability-gated
- `PUT /api/admin/specialists/:id/required-fields` — string[]; capability-gated
- `PUT /api/admin/specialists/:id/runtime` — jsonb; capability-gated
- `GET /api/admin/specialists/:id/audit` — append-only version history

The route surface intentionally has no relink endpoint. A defensive test
in `tests/server/admin-specialists.test.ts` scans every registered
handler key and fails the build if any future PR adds one containing
"assignment", "relink", or "rewire".

Mgmt-co router wiring (`engine/analyst/surface/mgmt-co/index.ts`):
`createMgmtCoRouter` accepts a `configs?: MgmtCoSpecialistConfigs`
option that threads each Specialist's per-row config (prompt template,
model resource id) into the factory. Evaluators stay deterministic with
a TODO marker for the upcoming LLM upgrade. The save-tab handler
(`server/routes/global-assumptions.ts`) loads
`getOrCreateSpecialistConfig` for both Funding and Revenue before
constructing the router, so admin edits take effect on the next save
without a code change.

## Risks and mitigations

| Risk                                       | Mitigation                                              |
|--------------------------------------------|---------------------------------------------------------|
| Centralized vendor-key edit blast radius   | Versioning, actor+diff audit, one-click rollback (P2)   |
| Test button vendor billing                 | Safe-probe profiles + per-admin quotas (P3)             |
| Stale-green health dot                     | TTL enforced on read; amber past TTL (P3)               |
| Code-only lockout during incidents         | Break-glass override (P2)                               |
