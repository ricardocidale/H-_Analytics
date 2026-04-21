# Resources Control Plane

Status: Locked 2026-04-21. P1 (contracts) shipped; P2–P7 in `.local/session_plan.md`.

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

## Risks and mitigations

| Risk                                       | Mitigation                                              |
|--------------------------------------------|---------------------------------------------------------|
| Centralized vendor-key edit blast radius   | Versioning, actor+diff audit, one-click rollback (P2)   |
| Test button vendor billing                 | Safe-probe profiles + per-admin quotas (P3)             |
| Stale-green health dot                     | TTL enforced on read; amber past TTL (P3)               |
| Code-only lockout during incidents         | Break-glass override (P2)                               |
