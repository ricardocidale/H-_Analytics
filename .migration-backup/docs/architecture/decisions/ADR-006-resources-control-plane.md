# ADR-006: Resources Control Plane + Read-Only Specialist Surfaces

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Human steward (4 user confirmations during the session), architect review (endorse-with-mods), Replit Agent (executor of P1–P5)
**Tags:** architecture, admin-ia, analyst, resources, specialists, governance
**Supersedes:** the inline-registry doctrine in `replit.md` "Admin IA — Defaults Group + AI Section (April 21, 2026, doctrine locked)" (v1, hub-and-spoke storage).

---

## Context

The Admin sidebar's AI surfaces have evolved through three doctrines in less than 24 hours. This ADR formalizes the third (and current) doctrine and records why the prior two were rejected, so future contributors don't re-litigate the architecture out of ignorance.

### Forces that drove the iteration

1. **Drift between user-edit surfaces and canonical truth.** The pre-Apr 21 model treated the AI section as a flat registry: vendor keys, model picks, prompts, and benchmark links were all authored inline on a single Admin page. As the Specialist count grew (now 7 — Funding, Revenue, ICP Intelligence, Risk Intelligence, Executive Summary, Photo Enhancer, Watchdog), inline authorship would have meant the same FRED API key copied into 5 Specialists, eventually disagreeing.
2. **Edit-blast radius vs. agility.** Vendor-key edits affect every Specialist that consumes the vendor. We needed a single canonical edit surface with versioning and rollback, but we also needed Specialist pages to be useful for the people tuning a single Specialist.
3. **Wiring authority.** Specialist↔Resource links are part of the system's invariants — the kind of thing a code reviewer should see in a diff. Runtime-editable wiring means an admin can silently rewire a Specialist away from the Resource its evaluator was tested against.
4. **Incident response.** A code-only wiring policy that requires PR + deploy will lose to fire-fighting needs (a vendor goes down at 2am). We needed an escape hatch that doesn't compromise the steady-state invariants.

### The three doctrines

**v0 (pre-Apr 21) — "AI section is the registry; AI Research pages reference inline."**
Single Admin > AI page authoring vendor keys, model picks, prompts, benchmark links, all in one place. AI Research surfaces were thin wrappers that referenced the registry. Worked for 2 Specialists; didn't scale to 7.

**v1 (Apr 21 morning) — "Specialist-first IA with hub-and-spoke storage."**
Each Specialist gets its own page. Persistence is a many-to-many `specialist_resource_links` join. Editing an API key inside Specialist A mutates the canonical row; an "also used by: …" impact list is shown inline. Specialist pages are the **only** UX edit point. This was the doctrine in `replit.md` from earlier in the session, before the architect review. It solved the duplication problem but kept wiring fully runtime-editable, which kept all four forces above unresolved.

**v2 (Apr 21, this ADR, LOCKED) — "Resources is the canonical control plane; Specialist pages are read-only assignment + health surfaces; wiring is code-only with audited time-boxed break-glass."**

---

## Decision

We adopt the v2 doctrine in full. Concretely:

### 1. Top-level Admin sidebar shape

```
Defaults | Resources | AI Platform | AI Research | (existing non-AI sections)
```

### 2. Resources is the canonical control plane

A new top-level Admin section with five sub-pages, each the **single canonical edit surface** for that resource kind app-wide:

| Sub-page | Definition |
|---|---|
| APIs | Authenticated executable connectors (FRED, OpenAI, Anthropic, Stripe, Twilio, ...) |
| Sources | Content / feed / dataset origins (RSS, public CSVs, scrape targets, uploaded datasets) |
| Tables | Internal lookup / reference tables |
| Benchmarks | Comparison datasets |
| Models | LLM model registry (vendor + model id + capabilities) |

APIs and Sources are sibling categories, not subtype: APIs = "I can call this and it does something"; Sources = "this is where data comes from."

Each Resource record lives in canonical `admin_resources` (typed `kind` + `config` JSON + `secretRef` + health columns). Edits are versioned with actor + diff + rollback pointer. Secrets live behind `secretRef`, never in the payload.

### 3. AI Platform is kept thin

AI Platform is deliberately small and owns only:

- **Universal LLM Uses** — non-Specialist LLM consumers (Rebecca chat's prompt+model, generic embeddings, generic system prompts).
- **Routing & Fallback Policy** — cross-vendor failover, retry policy, cost guardrails.
- **Cross-vendor Observability** — latency / error / spend dashboards aggregated across all consumers (Specialists + Universal).

AI Platform does **not** own vendor keys or the model registry. Those moved to Resources.

### 4. Specialist pages become read-only for assignments

`AI Research → Subject → Specialist` stays. The Specialist page renders capability-driven tabs (`Required Fields`, `LLM Config`, `Resource Assignments`, `Runtime / Triggers`, `Audit`, `Per-Resource Overrides`). The `Resource Assignments` tab is **read-only**: it shows every Resource the Specialist's catalog declaration links to, with green/amber/red/gray health dot and a Test button. There is no UI affordance to relink an assignment from the Specialist page — the only escape is "Edit in Resources →" or the break-glass override.

### 5. Wiring authority is code-only with break-glass

The Specialist↔Resource link set is declared in the Specialist catalog at `engine/analyst/registry/specialist-catalog.ts` via each Specialist's `assignmentRefs`. Adding or removing a link requires a code edit + PR + deploy.

A **break-glass override** (super-admin-only, time-boxed, fully audited via `audit_break_glass_overrides`) exists for incident reroute. Every override surfaces a banner on the affected Specialist page until the underlying catalog is patched.

### 6. Health-dot semantics are freshness-banded

Background checker probes each resource on its kind's TTL and writes to `resource_health_checks`. The Specialist page reads cached status:

| Band | Color | Condition |
|---|---|---|
| green | 🟢 | Last check OK AND `checkedAt` within TTL |
| amber | 🟡 | Last check OK BUT `checkedAt` past TTL |
| red | 🔴 | Last check failed |
| gray | ⚪ | Never checked / unknown |

Stale-green is forbidden by design — a confidently-green dot pointing at a dead vendor is worse than red.

---

## Consequences

### Positive

- **Single source of truth per resource.** A vendor key edit happens once, in one place, with versioning and rollback. The "also used by" impact surface is a query against `specialist_assignments`, not a manual sync.
- **Wiring diffability.** Every Specialist↔Resource link is in code, reviewable in PRs. New Specialist or new dependency = visible diff. Future regressions surface in `git blame`, not in DB archaeology.
- **Specialist pages stay useful for tuning** without becoming a parallel control plane. Prompt + model selection + required fields + runtime knobs are all editable per-Specialist; Resources are referenced by id.
- **Incident response is unblocked** by break-glass override, but every override is auditable, time-boxed, and surfaces a banner — so it cannot silently become the new steady state.
- **Health surface is honest.** Stale-green is impossible; amber forces re-check.

### Negative

- **Slower ops for wiring changes.** Adding a new Resource consumer requires a PR + deploy, not a runtime edit. Mitigated by break-glass for true incidents; the slowness is the point for non-incidents.
- **Split context for end-to-end debugging.** A failing Specialist might require checking the Specialist page (config, audit) AND the Resources page (canonical config, health). Mitigated by deep-link buttons on both surfaces.
- **Higher upfront migration complexity.** Existing `data_sources` / `LlmDefaultsTab` / pipeline tables become seed inputs to Resources via adapters (P6) rather than disappearing. P1–P5 ship before any user-visible legacy removal.

### Neutral / Notable

- **The Specialist catalog is now load-bearing for governance**, not just for runtime dispatch. It must stay typed, validated (`SpecialistDefinitionSchema`), and CI-protected against drift between the catalog and the materialized `specialist_assignments` join.
- **Per-Specialist mutable config** (prompt, model assignment, required fields, runtime) lives in `specialist_configs` with append-only history in `specialist_config_versions`. The catalog stays code-only; the knobs are admin-editable without a deploy.
- **Resource Assignment editability is intentionally absent from the API surface.** A regression test (`tests/server/admin-specialists.test.ts` "read-only invariant") fails if a future PR adds any Specialist route containing "assignment", "relink", or "rewire".

---

## Alternatives considered

### v0 — AI section as flat registry, AI Research pages as inline references

Rejected because:
- Vendor keys would need to be copied into every consumer Specialist's edit surface; the "5 copies of the same key eventually disagree" failure mode was inevitable.
- Specialist pages would be the only place a Specialist's prompt could be edited, but vendor keys would NOT be editable there — split-brain UX.

### v1 — Hub-and-spoke storage with `specialist_resource_links`

Rejected because:
- Wiring stayed runtime-editable. An admin clicking through a Specialist page could silently rewire it away from the Resource its evaluator was tested against, with no PR trail.
- The "edit canonical from Specialist A, see effect in Specialist B" cross-cutting UX is powerful, but it makes the blast radius invisible at edit time. v2 keeps the blast radius (one canonical row) without the invisibility (you edit on the canonical Resources page; the impact list lives there too).

### v2'' — Code-only wiring with NO break-glass

Rejected because:
- Vendor outages happen on weekends. Requiring a deploy to reroute would mean degraded service until on-call ships a PR. Break-glass with audit + time-box gives ops the lever without weakening the steady-state invariant.

### v2''' — Specialist pages get NO config tabs (everything is Resources)

Rejected because:
- Per-Specialist prompts, model picks, and required-field lists are NOT cross-Specialist concerns. Forcing them into Resources would make Resources a leaky abstraction (per-consumer overrides leaking into a "canonical" surface). Specialists deserve their own tuning home; they just don't deserve assignment-edit authority.

---

## Implementation notes

The v2 doctrine ships in 7 phases (P1 → P7). Live status lives in `.claude/phases.md` under the "Resources Control Plane" workstream. Planned scopes:

| Phase | Scope |
|---|---|
| P1 | Specialist catalog + capability matrix; rename `resourceRefs` → `assignmentRefs`; mark read-only |
| P2 | `admin_resources` + `admin_resource_versions` + `audit_break_glass_overrides` + `specialist_assignments` materialization job |
| P3 | Resource health checker (background probe) + `resource_health_checks` + freshness-band derivation + Test button safe-probes |
| P4 | Resources sub-page UIs (APIs, Sources, Tables, Benchmarks, Models) + dialogs + version history |
| P5 | Specialist read-only surfaces (Funding + Revenue first): 6 REST routes, 5 capability tabs, 11 contract tests, mgmt-co router wiring for prompt/model edits |
| P6 | Resources adapters for legacy `data_sources` / `LlmDefaultsTab` seed → `admin_resources` rows; UX polish (audit-tab user names, centralized SPECIALIST_SECTION_TO_ID); Required Fields enforcement |
| P7 | Specialists C–G (ICP Intelligence, Risk Intelligence, Executive Summary, Photo Enhancer, Watchdog) get real evaluators behind their existing pages |

### P5 surface (concrete contract)

Routes (all `requireAdmin`):

- `GET /api/admin/specialists` — catalog list with status
- `GET /api/admin/specialists/:id` — definition + config + assignments-with-health
- `PUT /api/admin/specialists/:id/llm-config` — prompt + model resource id (capability-gated)
- `PUT /api/admin/specialists/:id/required-fields` — string[] (capability-gated)
- `PUT /api/admin/specialists/:id/runtime` — runtime config jsonb (capability-gated)
- `GET /api/admin/specialists/:id/audit` — append-only version history

There is intentionally no route to relink resource assignments through the Specialist surface. Edits happen on the canonical Resources pages; incident reroutes go through `/api/admin/break-glass`.

Per-Specialist config storage: `specialist_configs` (one row per Specialist) + `specialist_config_versions` (append-only, snapshots prior state at version N before applying patch that produces version N+1). Storage class: `server/storage/specialist-config.ts`.

Mgmt-co router wiring: `createMgmtCoRouter` accepts a `configs?: { funding?, revenue? }` option. The save-tab handler (`server/routes/global-assumptions.ts`) loads `getOrCreateSpecialistConfig` for both Specialists before constructing the router, so an admin's prompt or model edit takes effect on the next save without a code change. Evaluators stay deterministic with a TODO marker for the upcoming LLM upgrade.

---

## References

- Related ADRs: ADR-001 (analyst two-tier), ADR-002 (engine-analyst skeleton), ADR-003 (analyst verdict contract)
- Related architecture docs: `docs/architecture/resources-control-plane.md`, `docs/architecture/ANALYST.md`, `docs/architecture/analyst/*`
- Related skill files: `.claude/skills/analyst/_index.md`, `.claude/skills/analyst/surface-mgmt-co.md`
- Doctrine block: `replit.md` "LOCKED 2026-04-21 (architect endorse-with-mods + 4 user confirmations) — Resources as a top-level Admin control plane"
- Implementation: commit `2346de7` (P5), `engine/analyst/registry/specialist-catalog.ts`, `server/routes/admin/specialists.ts`, `client/src/pages/admin/specialist/SpecialistPage.tsx`
