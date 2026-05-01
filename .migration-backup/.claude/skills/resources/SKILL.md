# Skill: Resources Control Plane

**Purpose:** Authoritative directive reference for any work touching the Resources control plane — `admin_resources` schema, safe-probe profiles, the resource health checker, the Resources sub-page UIs, the Specialist↔Resource wiring graph, or the break-glass override path. Load this before extending any of those surfaces.

**Status:** LOCKED 2026-04-21. P1–P5 shipped; P6+ pending. See `.claude/phases.md` for live phase status. Architecture rationale lives in ADR-006; descriptive companion at `docs/architecture/resources-control-plane.md`.

---

## Scope — load this skill when

You are about to:

- Add a new `ResourceKind` (or extend the boundary of an existing one).
- Write or edit a safe-probe profile.
- Extend the resource health checker (`server/jobs/resource-health-checker.ts`).
- Build a new Resources sub-page or modify an existing one.
- Wire a new Specialist's `assignmentRefs` in `engine/analyst/registry/specialist-catalog.ts`.
- Touch the break-glass override flow (`audit_break_glass_overrides`).
- Add or modify a `secretRef`-resolving runtime call site.

You do **not** need this skill for: Specialist-side per-row config (prompt template / model pick / required fields / runtime knobs) — those live in `specialist_configs` and are governed by the Analyst skill (`.claude/skills/analyst/_index.md`).

---

## Five non-negotiable invariants

1. **Resources is the single canonical edit surface.** Vendor keys, model registry, benchmark datasets, and source connectors are authored exactly once, in `admin_resources`. Specialist pages render Resource Assignments **read-only** with health dots. There is no Specialist-side "edit this Resource" affordance and no Specialist-side relink endpoint.
2. **Secrets only via `secretRef`.** No vendor key, OAuth token, or API credential ever lives inline on a Resource record. Each record carries an optional `secretRef` pointing into the project's secret store (Replit Secrets); runtime modules resolve it at call time. A PR adding inline secret material to `admin_resources` must be rejected.
3. **Wiring is code-only via the Specialist catalog.** The Specialist↔Resource link set is declared in `engine/analyst/registry/specialist-catalog.ts` via each Specialist's `assignmentRefs`. Adding, removing, or rewiring a link is a code edit + PR + deploy. The catalog-sync job materializes the declarations into `specialist_assignments`. No runtime affordance exists to mutate the graph.
4. **Break-glass is super-admin-only, time-boxed, and fully audited.** The escape hatch (`audit_break_glass_overrides` table) is reserved for incident response — e.g. swapping a dead vendor under fire. Each override declares an expiry; expired overrides revert automatically. Every override surfaces a banner on the affected Specialist page until the underlying catalog is patched. It is **not** for normal config churn, experiments, or convenience rewiring.
5. **Stale-green is forbidden.** A health dot may be green only if the last probe succeeded AND `checkedAt` is within the kind's TTL. Past-TTL OK readings render amber, never green. A confidently-green dot pointing at a dead vendor is worse than red.

---

## ResourceKind boundary criteria

Five kinds, sibling categories (NOT subtypes). Decide which kind a new Resource belongs to with the test in the right column.

| Kind | Definition | "Is this an X?" decision rule |
|---|---|---|
| **APIs** | Authenticated executable connectors (FRED, OpenAI, Anthropic, Stripe, …) | "Can I `fetch()` it with a credential and get a response?" → API. |
| **Sources** | Content / feed / dataset origins (RSS, public CSVs, scrape targets, …) | "Is this where data *originates* before we transform it, with no auth or weak/public auth?" → Source. |
| **Tables** | Internal lookup / reference tables (curated benchmark grids, code lists, fee schedules) | "Is this a row-shaped reference dataset that we *own* and can edit row-by-row in admin?" → Table. |
| **Benchmarks** | Comparison datasets surfaced for like-for-like compare (ADR/RevPAR comps, occupancy benchmarks, salary surveys) | "Is this used to compare a user value against a population to produce a verdict band?" → Benchmark. |
| **Models** | LLM model registry (vendor + model id + capabilities + cost/latency profile) | "Is this a `{ vendor, modelId }` tuple consumed via an API connector to produce text/structured output?" → Model. |

**Boundary sharpness rules:**

- A vendor (e.g. OpenAI) is an **API** Resource. Each model that vendor offers (e.g. `gpt-4o-2024-11-20`) is a separate **Model** Resource that references the API. The two are not collapsed.
- A scraped feed becomes a **Source**. Once normalized into a row-shaped reference grid in our DB, it's a **Table** (or a **Benchmark** if it's used for comparison).
- A Resource never belongs to two kinds. If the boundary is ambiguous, write the rule that disambiguates them in this skill's "boundary sharpness rules" list before adding the Resource.

---

## Add a new `ResourceKind` — runbook

Adding a new kind (rare — last addition was Models). Five steps, in order:

1. **Schema slot.** Add the kind to the `ResourceKindEnum` in `shared/schema/admin-resource.ts`. Add the kind's display label and icon in the same file's `RESOURCE_KIND_LABELS` map. Run `npm run db:push --force` to apply.
2. **Probe profile.** Author the kind's probe profile under `server/jobs/probes/<kind>.ts` and register it in the probe registry. Profile must satisfy the [probe-profile contract](#probe-profile-contract) below.
3. **Health TTL.** Add the kind's TTL to the health-checker config (`server/jobs/resource-health-checker.ts`). Choose TTL based on observed-change cadence: APIs typically 1h, Sources 6h, Tables/Benchmarks 24h, Models 24h.
4. **Sub-page UI.** Add the kind's sub-page under the Resources router. The page renders the canonical list, edit dialogs (with audit-versioned writes), version history, and a Test button per row. Use the existing APIs sub-page as the structural template.
5. **`assignmentRef` compatibility.** Decide whether existing Specialists may declare `assignmentRefs` of this kind. If yes, extend the Specialist catalog's `assignmentRef` type union; if no, document the exclusion in this skill's boundary section.

Acceptance: a fresh Resource of the new kind can be created via the sub-page, probed via Test, gets a green health dot, and (if applicable) appears as a candidate in a Specialist's Resource Assignments tab.

---

## Probe-profile contract

Every safe-probe profile MUST satisfy all five:

| Property | Rule | Example |
|---|---|---|
| **Idempotent** | The probe call has no side effects beyond logging. | LLM API → `GET /v1/models`, NOT a chat completion. |
| **Side-effect-free** | The probe does not mutate, charge, or send. | Stripe API → `GET /v1/balance`, NOT a charge. |
| **Cost-guarded** | Profile declares `maxCostUsd` (default `0.001`). Runtime fails fast if the probe would exceed budget. | `ProbeProfileSchema.maxCostUsd: 0.001` |
| **Rate-limited** | Per-resource per-admin (`rateLimitPerMinute`). | Default 5/min/admin/resource. |
| **Audited** | Every Test press writes actor, resource, result, latency, timestamp to `admin_resource_test_log`. | Enforced in the probe runner, not optional per-profile. |

A probe that cannot satisfy these (e.g. an API whose only endpoint is a billable chat completion) needs a contract with the vendor or a vendor-hosted health endpoint added; do not stub a fake-OK profile.

---

## Break-glass override — flow + anti-patterns

**Flow:**

1. Super-admin opens the affected Specialist page, clicks "Break-glass override" on a Resource Assignment row.
2. Dialog requires: target Resource id, expiry (max 24h), justification (free text, ≥50 chars).
3. Override is written to `audit_break_glass_overrides` with actor, timestamp, target Specialist, target Resource, expiry, justification.
4. Banner appears on the affected Specialist page: "Break-glass override active until `<expiry>`. Underlying catalog still points at `<original>`. Patch the catalog before expiry."
5. At expiry the override is automatically revoked; the Specialist resumes using the catalog's wired Resource.
6. Every override (active and expired) appears in the global break-glass audit feed.

**Use this when:**

- A vendor is down and needs to be swapped to a backup *now*, before the next deploy window.
- A model is producing degraded output and a known-good substitute exists in the registry.

**Do NOT use this for:**

- Normal config churn (use the catalog PR flow).
- Experiments (use a feature flag + a new catalog row, not a runtime override).
- Convenience rewiring to avoid writing a PR.
- Anything that should outlast 24h (extend by re-issuing only with explicit justification; the audit feed surfaces repeat-issue patterns).

If you find yourself writing a fourth break-glass override against the same Specialist↔Resource pair, the catalog needs to change — file the PR.

---

## File map + reading order

| Order | File | Why |
|---|---|---|
| 1 | `docs/architecture/decisions/ADR-006-resources-control-plane.md` | The decision in full; alternatives rejected. |
| 2 | `docs/architecture/resources-control-plane.md` | Descriptive architecture spine. |
| 3 | `replit.md` "LOCKED 2026-04-21" block | User-facing IA narrative + phase context. |
| 4 | This file | Directive rules + invariants + runbooks. |
| 5 | `engine/analyst/registry/specialist-catalog.ts` | The wiring source of truth (`assignmentRefs`). |
| 6 | `shared/schema/admin-resource.ts` | Canonical schema, `ProbeProfileSchema`, `ResourceKindEnum`. |
| 7 | `server/routes/admin/resources.ts` | REST surface for canonical edits + version history. |
| 8 | `server/jobs/resource-health-checker.ts` + `server/jobs/probes/` | Health-check loop + per-kind probe profiles. |
| 9 | `server/jobs/catalog-sync.ts` | Materializes `assignmentRefs` → `specialist_assignments`. |
| 10 | `.claude/phases.md` | Live phase status across this and other workstreams. |

Budget: ~45 minutes the first time, 10 minutes to refresh.

---

## Cross-skill table

| If your task involves… | Also load |
|---|---|
| Specialist-side per-row config (prompt, model pick, required fields, runtime) | `.claude/skills/analyst/_index.md` (governance) + `surface-mgmt-co.md` |
| Adding a new Specialist that consumes Resources | `.claude/skills/analyst/_index.md` + this skill's [`assignmentRef` compatibility step](#add-a-new-resourcekind--runbook) |
| Probe-profile design for an LLM API | `.claude/skills/finance/SKILL.md` (cost guards) + `.claude/rules/deterministic-tools.md` |
| Resources sub-page UI | `.claude/skills/design-system/SKILL.md` + `.claude/skills/vocabulary/SKILL.md` |
| Secret resolution at runtime | `.claude/rules/security.md` (if exists) + the project's secret-store conventions |
| Versioned writes / audit | `.claude/rules/cross-check-invariants.md` (every write needs an `admin_resource_versions` row) |

---

## This skill is wrong if you find yourself…

- Adding a `secret` text column to `admin_resources` instead of a `secretRef` reference.
- Designing a Specialist-side endpoint that mutates `assignmentRefs`, `assignmentSet`, `assignmentLink`, or any equivalent.
- Writing a probe profile that calls a billable endpoint with a "small input."
- Adding a UI affordance to "edit this Resource here" on a Specialist page.
- Treating an expired break-glass override as still-active in any code path.
- Allowing a green health dot when `checkedAt` is past the kind's TTL.
- Adding a new `ResourceKind` without a probe profile, TTL, sub-page, and `assignmentRef` decision.
- Folding a vendor and one of its models into a single Resource record.
- Editing the catalog wiring outside `engine/analyst/registry/specialist-catalog.ts` (e.g. via a migration, a seed script, or a runtime mutator).

If any of these patterns appear in a PR, the change violates the LOCKED 2026-04-21 doctrine. Block the PR or escalate via `BLOCKED.md` on the active packet.
