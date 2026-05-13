**From:** Replit Agent (planner — Phase B plan author + reviser)
**To:** Fresh CC shell session (implementer — `ce.work phase c` against the Phase B plan)
**Date:** 2026-05-13
**Context:**
- Plan: `docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md` (status: `active`; 7 implementation units U1–U7; all `ce-doc-review` findings already applied)
- Origin requirements: `docs/brainstorms/2026-05-13-icp-bracket-mix-peer-derived-phase-b-requirements.md`
- Broader initiative brainstorm: `docs/brainstorms/icp-simplification/`
- Operating mode contract: `.agents/operating-modes/large-repo-shell-coderabbit-compound.md`
- Inviolable rules: `CLAUDE.md` §§ 1–12 (especially **§156 — financial-engine authoring restriction, which is the reason this work is being handed to you and not done in Replit Agent**)

**Why this is a handoff:**
1. **Authoring boundary.** Per CLAUDE.md §156, edits to `lib/engine/src/company/**` and adjacent engine code may only be authored from a shell CC session. The plan is engineered to keep the new write/read path *outside* the engine (`artifacts/api-server/src/services/bracketMix/effective.ts`), but if implementation reveals a true engine touch (Risk #1 in the plan), only you can land it.
2. **Branch authority.** Replit Agent's sandbox blocks `git branch -m`, `git checkout -b`, and `git push` — every potentially-destructive ref operation is rejected. Replit Agent is currently committed-on-`main` as of this brief; you start by branching off `origin/main`. **Read `docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md` first** — Replit Agent commits can accumulate on whatever branch is checked out, so verify the branch is clean before opening the PR.
3. **Scope — `ce.work` of a multi-unit plan with 4 new tables/columns, a Specialist + a Minion, an LLM-backed grounded research pipeline, route changes, parity-mapped Rebecca tools, and a feature flag — is well past the Replit Agent ceiling for a single session.

---

## Scope of work

Execute units **U1 → U7** from the Phase B plan, in that dependency order, on a fresh feature branch. Each unit ships as its own conventional commit; the full sequence ships as one PR. The plan body is the executable specification — this brief tells you how to drive `ce.work phase c` against it, what the inviolable boundaries are, what is explicitly *not* in scope, and how to know you are done.

Numerical envelope (from the plan):

- **Schema:** 5 new nullable columns on `icp_peer_companies`; 2 new tables (`bracket_mix_runs`, `bracket_mix_dual_run_diffs`); 1 new nullable FK column on `global_assumptions`. Two new migrations following the 0056 / 0057 guarded-`DO` pattern, two new `migration-guards.json` entries.
- **Code (api-server):** 1 new Specialist (`tiago.ts` — first inhabitant of `ai/ambient/specialists/`, no barrel index yet), 1 new minion (`hugo.ts`), 1 new orchestrator + feature-flag pair (`services/bracketMix/recomputeGlobalDefault.ts` + `featureFlag.ts`), 1 new effective-mix service (`services/bracketMix/effective.ts`), 4 new HTTP routes across 2 route files, 2 new Rebecca tool files + 1 dispatch wiring, 1 shared `writeEffectiveBracketMix` writer used by ALL writers of `globalAssumptions.bracket_mix` (audit existing writers per U6 Approach), 1 OpenAPI spec extension + codegen rerun.
- **Code (hbg-portal):** 1 K&R per-peer card with Evidence panel; updates to the front-of-app Mgmt Co bracket-mix card to add override indicator + provisional badge + per-company Analyst button (per `analyst-intelligence-display` SUPERSEDING block — Fabio range-quality dot + "out of range" chip; no deprecated `Outside suggested range · ● Med`).
- **Costantino:** per-peer freshness probe; new `peer_research_stale` finding kind; per-peer + source-registry default config rows (no inline literals — values live in DB).
- **Tests:** as enumerated per unit; covers AE1–AE6 from the origin requirements.

**Authoring constraint:** keep every change outside `lib/engine/src/company/**`, `lib/engine/src/company/bracket-service-consumption.ts`, and `lib/engine/src/helpers/normalize-bracket-mix.ts`. The plan is structured to make this achievable. If during U5/U6 you find an engine touch is actually required, **stop and surface it as a separate sub-task** — do not bundle it.

---

## File-by-file specification

The plan's `## Implementation Units` section (lines 130–376 of `docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md`) is the per-file spec — do not duplicate it here. Read each unit's `**Files:**`, `**Approach:**`, `**Patterns to follow:**`, `**Test scenarios:**`, and `**Verification:**` blocks before opening any editor on that unit. Cross-cutting clarifications and patterns the brief adds on top of the plan:

| Unit | Brief adds |
|---|---|
| **U1** | Mirror `artifacts/api-server/src/migrations/icp-brackets-001.ts` exactly for the guarded-`DO` shape. Add the new entry to `migration-guards.json` *in the same commit* — `check:migration-guards` is a separate workflow and will fail loudly if you forget. **Read `docs/runbooks/schema-migrations.md` and `docs/solutions/workflow-issues/seed-pipeline-drift-dual-migration-folders-and-uncalled-medellin-duplex-2026-05-12.md` BEFORE writing the migration** — there are two migration folders in this repo and prior work has drifted into the wrong one. |
| **U2** | The override sentinel column is a `nullable FK to bracket_mix_runs.id` — define both new tables in the same migration so the FK target exists on first apply. Cold-start invariant: U2 only creates structure; U5 is responsible for ensuring the engine and `effectiveBracketMix` agree on day one (see plan U5 Approach paragraph 2). |
| **U3** | `ai/ambient/specialists/` does not exist today. Create it; do **not** add a barrel `index.ts` until a second specialist module lands. Both entry points (`runForPeer`, `runForCompanyOverride`) return the same `BracketMixSpecialistOutput`. Carlo-style Zod validation BEFORE persisting any DB row. |
| **U4** | Pure deterministic function — no IO except the optional caller-driven `bracket_mix_runs` insert. Cold-start path returns `{ provisional: true }` and **does not** insert a row; the orchestrator (U5) inserts the provisional row instead. |
| **U5** | The override-aware writer (`writeEffectiveBracketMix`) is introduced in U6 but U5's orchestrator must call it (or at minimum respect the same override-protect rule) so override is never silently overwritten by a recompute. Test-first the dual-run write path. |
| **U6** | Audit existing writers of `globalAssumptions.bracket_mix` BEFORE adding the new endpoints. The plan names two known endpoints (`POST /api/company/bracket-mix/assign`, `PATCH /api/company/bracket-mix`); confirm via `rg "bracket_mix|bracketMix" artifacts/api-server/src/routes/` and route them through `writeEffectiveBracketMix` in the same PR. The parity map test must fail the build if a new mutation route lacks a Rebecca tool. After OpenAPI changes, rerun `pnpm --filter @workspace/api-spec run codegen` per `pnpm-workspace` skill. |
| **U7** | Probe registers via the existing `source-registry.ts` / `admin-resources.ts` shape — no new probe runner. Defaults (`staleAfterDays: 90`, `recheckCadence: 'weekly'`) live in DB rows, not as TS literals. Update `costantino-data-custodian` SKILL.md with the new finding kind in the same commit. |

**Specialist + minion names (do not change):** Tiago (Specialist), Hugo (aggregator minion). Both verified unused in the `slide-factory` SKILL.md roster and not on the reserved-exclusion list (Sergio, Milton). Add them to the SKILL.md roster as part of U3 / U4 commits per plan §Documentation / Operational Notes.

---

## Verification

Run from repo root, in this order. Every command must exit 0 before the PR is opened.

```bash
# 1. Branch hygiene
git fetch origin
git --no-optional-locks status                    # working tree clean
git --no-optional-locks log origin/main..HEAD --oneline  # only your Phase C commits

# 2. Per-unit gates (run after each unit; minimum bar before next unit)
pnpm --filter @workspace/scripts run check:migration-guards
pnpm --filter @workspace/scripts run check:schema-drift
pnpm run typecheck
pnpm run check:lint
pnpm --filter @workspace/calc run test

# 3. Full pre-PR gate (all green before push)
pnpm --filter @workspace/scripts run check:direct-run-guards
pnpm --filter @workspace/scripts run check:lint
pnpm --filter @workspace/scripts run check:lint:libs
pnpm --filter @workspace/scripts run check:magic-numbers
pnpm --filter @workspace/scripts run check:migration-guards
pnpm --filter @workspace/scripts run check:production-image
pnpm --filter @workspace/scripts run check:replit-independence
pnpm --filter @workspace/scripts run check:schema-drift
pnpm --filter @workspace/scripts run check:spinner-contrast
pnpm --filter @workspace/scripts run check:taxonomy-mirror
pnpm --filter @workspace/scripts run check:types-mirror
pnpm run typecheck
pnpm --filter @workspace/calc run test

# 4. Parity gate (covers R17)
# Locate the existing parity test and confirm it runs as part of the standard gate:
#   rg -l "parity" artifacts/api-server/src/chat/__tests__/ scripts/src/
# If a test file exists (e.g. rebecca-tool-parity.test.ts), extend it in U6 with the
# four new bracket-mix routes; if no test exists, create one in U6 (the parity-audit
# skill is the canonical reference). The U6 parity map test must fail the build if
# any new mutation route lacks a Rebecca tool.

# 5. Smoke validation (manual, post-build)
pnpm --filter @workspace/api-server run dev          # in one shell
curl http://localhost:80/api/health/live              # → 200
# Then use the dev-login flow from replit.md §Gotchas to call:
# POST /api/admin/icp/bracket-mix/global/regenerate    (expect: bracket_mix_runs row + dual-run diff row)
# POST /api/admin/icp/peers/:id/refresh                (expect: peer's last_research_run_id populated)
# POST /api/companies/:id/bracket-mix/override
#   Body: {} (slugs resolved from stored comp set) OR {"compSetSlugs": ["slug-a","slug-b"]}
#   (expect: Tiago run row in bracket_mix_runs, override_run_id set, mix mirrored)
# DELETE /api/companies/:id/bracket-mix/override       (expect: override_run_id NULL, mix re-mirrored)
```

**Pre-existing-failure context (resolved at handoff time):** as of 2026-05-13 01:45 UTC the four checks `check:lint`, `check:typecheck`, `check:production-image`, and `check:magic-numbers` were all PASS on `main` after a fresh restart — earlier failures were stale ESLint / TS / ratchet-baseline cache state, not real code defects. You should not have to fix anything before starting U1.

---

## What this handoff does NOT include

- **Phase C teardown of the legacy property-level derivation path.** That is a separate plan (named in the current plan's `### Deferred to Follow-Up Work`) and is gated on the dual-run diff log producing stable, explainable diffs. Do not retire any legacy code in this PR.
- **Engine edits.** Do not modify `lib/engine/src/company/company-engine.ts`, `lib/engine/src/company/bracket-service-consumption.ts`, or `lib/engine/src/helpers/normalize-bracket-mix.ts`. The plan is engineered around leaving these untouched. If you find you need to, surface it as a separate sub-task and pause this PR until that sub-task lands.
- **The four legacy ICP client pages** (`Icp.tsx`, `IcpStudio.tsx`, `CompanyIcpDefinition.tsx`, the four `pages/icp/` tabs). Untouched per plan §Scope Boundaries.
- **Vendor pass-through cost / Mgmt Co markup factor national tables** — separate populating task; out of scope.
- **The three plan items deferred at the 2026-05-13 review** (R16 cross-ref note is already applied; the K&R/front-of-app non-happy-state spec resolves *during* U6 implementation per plan §Deferred / Open Questions; the cutover falsifiability criterion is captured in the future Phase C teardown plan, not this PR).
- **Per-Mgmt-Co override UI on the front-of-app for non-admin users** — the API + admin-side trigger is in scope (U6); a different UX shape for end-user Mgmt Co users is a follow-up.
- **Branch creation, rename, push, or PR creation from Replit Agent.** All ref operations are sandbox-blocked there. *You* (CC) own the branch from creation through merge.
- **Modifications to the Phase B plan itself.** It is final at handoff time. Surface any plan errors as PR-description notes; do not edit the plan in this PR.
- **Modifications to `replit.md` Recent Significant Changes** — only update that block when the Phase B feature flag actually flips on in prod (per plan §Documentation / Operational Notes), which is operator action, not part of the merge.

---

## Definition of done

The handoff is complete when **all** of the following are true:

1. **Branch exists and is pushed:** `feat/icp-bracket-mix-peer-derived-phase-b`, off latest `origin/main`, with Phase A's `icp_peer_companies` schema present (verify via `rg "icp_peer_companies" lib/db/src/schema/`).
2. **Seven commits, conventional, in U-order:** one per unit, each commit message body referencing the R-IDs covered (e.g., `feat(db): U1 — extend peer registry with Specialist columns (R1, R10)`).
3. **All Verification commands above pass on the pushed HEAD.**
4. **PR open against `main`** with body that:
   - Links the plan and origin brainstorm.
   - Lists the 7 units and their R-ID coverage.
   - Names Tiago + Hugo as new members of the agent roster (with a checkbox confirming `slide-factory` SKILL.md was **updated to add them** — they are not on the roster today and U3 / U4 are responsible for adding them).
   - States the feature flag default per environment (`BRACKET_MIX_PHASE_B = on` for dev/staging, `off` for prod).
   - Calls out the override-aware writer audit (which existing writers were rerouted through `writeEffectiveBracketMix`).
   - Confirms zero edits under `lib/engine/src/company/**` (or, if that constraint had to be relaxed, names the separate sub-task that authored those edits).
5. **Plan status flipped:** `docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md` frontmatter `status:` changes from `active` to `completed` in the same PR's final commit, per `ce-work` Phase 4 shipping convention.
6. **Costantino + slide-factory skill docs updated** in-PR per plan §Documentation / Operational Notes (Tiago + Hugo on the roster; `peer_research_stale` finding kind on `costantino-data-custodian`).
7. **Parity map updated and U6 parity test green** — the build must fail if a future mutation route is added without a Rebecca tool.

When the PR is merged, the cycle hands back to operators (not to Replit Agent): they review the dual-run diff log for one full recompute cycle in dev/staging, then flip the prod env var. That handoff is *not* part of this brief.
