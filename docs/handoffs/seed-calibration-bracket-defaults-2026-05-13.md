**From:** Replit Agent (planner + Layer-1/Layer-2 substrate author for U5)
**To:** Fresh CC shell session (implementer — `ce.work` against the remaining units)
**Date:** 2026-05-13
**Context:**
- **Plan (executable spec):** `docs/plans/2026-05-13-001-feat-seed-calibration-bracket-defaults-and-irr-views-plan.md`
- **Bracket-mix concept (governing doc — read first):** `docs/concepts/bracket-mix.md`, especially **§ 6a "Defaults-template flow"** which is what U5/U6/U7 operationalize
- **User direction verbatim:** `docs/concepts/bracket-mix.md` § 2 (2026-05-11) and § 2a (2026-05-13)
- **Prior phase B handoff (analogous boundary, useful template):** `docs/handoffs/phase-c-icp-bracket-mix-peer-derived.md`
- **Inviolable rules:** `CLAUDE.md` §§ 1–12; especially the financial-engine authoring restriction — **edits to `lib/engine/**` and `lib/calc/**` may only be authored from a shell CC session, not from Replit Agent.** That is the reason for this handoff.
- **Sidebar rename context (2026-05-13):** the user-facing label for the admin group historically called "Steady State" is now **"Model Defaults"** (internal `id` stays `financial-defaults`). Skill: `.agents/skills/steady-state-naming/SKILL.md`. The plan body still uses the old label "Steady State" in some places — treat any new UI copy you add as **"Model Defaults"**.

**Why this is a handoff:**
1. **Authoring boundary.** U2 (refinance-pass cap inside `lib/engine/src/property/refinance-pass.ts`) and U6 (the bracket-blending resolver that the engine consumes) cross into engine territory. Replit Agent must not author engine code.
2. **DB writes at scale.** U7 (bracket-catalog backfill) and U1 (re-seed seven properties + Duplex per-entity overrides) are larger DB operations than Replit Agent should drive against Neon. CC shell with `POSTGRES_URL` is the safer surface.
3. **Branch + PR authority.** Replit Agent commits land on whatever branch is checked out and the sandbox blocks `git checkout -b` / `git push`. CC opens the branch and the PR.

---

## Scope of work

Execute the **remaining units** of the plan in the order shown below. Each unit ships as its own conventional commit; the full sequence ships as one PR.

```
[DONE by Replit Agent]   U5  Bracket-default schema extension — Layer-1 + Layer-2 substrate
                                ├─ commit 9209d84ea (merged to main 2026-05-13)
                                └─ See "What is already done" below for the file inventory

[YOU START HERE]         U6  Bracket-default seeding pathway (3-layer resolver at POST /api/properties)
                          │   + dev-seed parity (no literals)
                          ▼
                         U7  Bracket catalog backfill (UPDATE icp_brackets rows with market values)
                          ▼
                         U1  Re-seed demo properties through the bracket-default pathway
                              + Duplex per-entity CONFIRMED overrides (exit_cap_rate=0.075, max_occupancy=0.30)
                          │
                          ├──► U2  Refi LTV cap — schema + engine (lib/engine/src/property/refinance-pass.ts)
                          │       (independent of U6/U7/U1 — can run in parallel from the start)
                          ▼
                         U3  Refi LTV cap — UI (PropertyEdit DebtSection)
                          ▼
                         U8  Verification (combined IRR in 28–38% band) + documentation
```

The plan body (the `docs/plans/2026-05-13-001-…` file) is the **executable specification** for each unit — file paths, acceptance criteria, test list. This brief just tells you what is already done, what the boundaries are, and how to know you are done.

---

## What is already done (U5 — Layer-1 + Layer-2 substrate)

Commit **`9209d84ea`** ("feat(defaults): U5 — Layer-1+Layer-2 substrate for refi-LTV cap & exit cap") is on `main`. It established the substrate U6 will consume:

- **Schema (`lib/db/src/schema/`)** — added `default_exit_cap_rate` and `default_refi_max_ltv_to_original` numeric columns to `icp_brackets`. Migration applied + journal synced per `docs/runbooks/schema-migrations.md`.
- **`model_defaults` (Layer 1)** — added two universal-fallback rows: `property.template.exitCapRate` and `property.template.refiMaxLtvToOriginal`. Visible/editable under **Admin → Model Defaults → Property** (PropertyUnderwritingTab).
- **Admin editor for bracket catalog** — both new fields are editable per row.
- **Server-side seed/admin route stubs** — `artifacts/api-server/src/routes/admin/model-defaults.ts` reads the new rows; comments updated to reference "Model Defaults" (not "Steady State").

What U5 **did NOT do** (these are U6/U7/U1):
- It did NOT write the resolver that blends bracket templates and writes Layer 3 onto a new property — that's U6.
- It did NOT populate the seven `icp_brackets` rows with market values — those columns are NULL today. That's U7.
- It did NOT touch any property row. The seven demo properties still hold the old DEFAULT values. That's U1.

Verify the U5 substrate is intact before you start U6:
```bash
git log --oneline -5                    # 9209d84ea should be visible on main
pnpm --filter @workspace/scripts run check:schema-drift
pnpm --filter @workspace/scripts run check:taxonomy-mirror
```

---

## What is left to do (you, in CC shell)

Authoritative file paths and acceptance criteria are in the plan. This is a one-line summary per unit so you can scope `ce.work` against them.

### U6 — Bracket-default seeding pathway *(critical-path; engine-adjacent)*
- **Resolver helper** in `artifacts/api-server/src/services/bracketMix/effective.ts` (or sibling) — single function consumed by both `POST /api/properties` and the dev-seed script. Reads Layer 1 → blends Layer 2 across the company's bracket mix → writes Layer 3 (DEFAULT state). No literals anywhere.
- **`POST /api/properties`** in `artifacts/api-server/src/routes/properties.ts` calls the resolver.
- **Dev-seed script** (locate via `rg "icp_brackets" artifacts/api-server/src/seed/ lib/db/seed/`) — invokes the same resolver; remove any hardcoded exit-cap or refi-LTV literal it currently carries.
- **Integration test** — known bracket mix → asserts the new property's `exit_cap_rate` and `refi_max_ltv_to_original` match the weight-blended values.

### U7 — Bracket catalog backfill *(DB write only)*
UPDATE the existing `icp_brackets` rows with the market values per the table in plan § U7:

| Bracket tier | default_exit_cap_rate | default_refi_max_ltv_to_original |
|---|---|---|
| US tertiary boutique resort | 9.75% | 0.70 |
| US gateway boutique | 8.50% | 0.70 |
| Latin America prime urban boutique | 10.50% | 0.65 |
| Latin America rural / illiquid | 12.00% | 0.60 |
| Latin America luxury STR (single-key) | 11.00% (Duplex overrides 7.50% per-entity) | 0.70 |

Enumerate any additional brackets in `artifacts/api-server/src/ai/icp/bracket-catalog.ts` and assign at U7 start.

### U1 — Re-seed + Duplex per-entity overrides *(DB write only; depends on U6 + U7)*
- Re-run the (now bracket-driven) dev seed against the demo company. Seven demo properties' DEFAULT-state values reset to the bracket-blended values.
- Apply two CONFIRMED-state per-entity overrides on the **Medellin Duplex** with provenance metadata: `exit_cap_rate = 0.075` (package-sale-to-Cartagena-guests thesis) and `max_occupancy = 0.30` (ultra-luxury $1,500 ADR positioning).
- One-off script: `scripts/src/apply-per-entity-overrides-2026-05-13.ts`.
- Write `docs/runbooks/seed-calibration-2026-05-13.md` (created in U1, completed in U8).

### U2 — Refi-LTV cap, schema + engine *(engine-only; can start in parallel with U6)*
- Add `properties.refi_max_ltv_to_original numeric default 0.70 not null` (sequential migration).
- `lib/engine/src/property/refinance-pass.ts` — cap target loan at `original_loan × refi_max_ltv_to_original`; emit existing engine diagnostic when cap binds.
- `lib/engine/src/property/resolve-assumptions.ts` — surface field on property context.
- `artifacts/api-server/src/routes/properties.ts` — accept on PATCH/POST.
- Tests: three branches (cap doesn't bind / 70% binds / 50% binds tighter) + default-applied-when-absent.

### U3 — Refi-LTV cap, UI
- `artifacts/hospitality-business-portal/src/components/property-edit/DebtSection.tsx` — numeric input next to the existing `refi_ltv` field. Default 70%, 0–100%, helper text per plan § U3.

### U8 — Verification + documentation
- Run `GET /api/finance/compute` against the demo company. Combined portfolio IRR must land **28–38%**. Document before/after IRR table in `docs/runbooks/seed-calibration-2026-05-13.md`.
- Add a sentence to `docs/concepts/bracket-mix.md` § 6a pointing at this plan as the first concrete operationalization of bracket-default fields.

---

## Inviolable boundaries

- **Engine authoring (`lib/engine/**`, `lib/calc/**`) is yours, not Replit Agent's.** This is the rule that triggered the handoff. U2 is squarely engine; U6's resolver lives outside the engine in `artifacts/api-server/src/services/bracketMix/` per the plan's deliberate engineering. If U6 implementation reveals a true engine touch, only you can land it.
- **No hardcoded numeric literals.** Per `no-magic-numbers` skill and the plan's canonical-flow lock: every default flows through Layer 1 → Layer 2 → Layer 3. Seed scripts, route handlers, engine modules, admin UI — none may carry a literal exit cap or refi-LTV value.
- **Admin sidebar group label is "Model Defaults"** (renamed 2026-05-13). Internal `id` stays `financial-defaults`. Any new UI copy you add for these fields uses "Model Defaults". See `.agents/skills/steady-state-naming/SKILL.md`.
- **Migration journal must be synced after each migration.** Per `docs/runbooks/schema-migrations.md` — compute SHA-256, INSERT into `drizzle.__drizzle_migrations`. Do NOT assume `drizzle-kit push` succeeded silently.
- **Bracket-overlay (Layer 2) writes happen ONLY at entity creation, never retroactively.** Per `hplus-assumption-lifecycle` skill. The seven demo properties are reset in U1 by re-running the seed (which goes through the resolver), not by a bulk UPDATE.
- **Duplex 7.5% exit cap is a per-entity CONFIRMED override, NOT a bracket-template value.** Future engineers must not "correct" it to market 11%. Document the rationale in the U1 runbook + a Postgres `COMMENT ON COLUMN` on the row if practical.

---

## What this handoff does NOT include

- No engine algorithm changes. IRR Newton-Raphson, NOI roll-up, exit-value formula stay as-is. Only inputs change.
- No three-IRR / LP-vs-asset-vs-sponsor view. Pure levered/equity IRR — one figure — as today.
- No GP/LP equity split, waterfall, preferred return, promote.
- No dashboard "show the Duplex" fixes (room-weighted blind-spot, financed-only-skip, STR-routing) — separate follow-up.
- No mgmt-co fee or vendor pass-through recalibration.
- No retroactive bracket cascade onto existing entities.

---

## Verification (run before opening the PR)

```bash
pnpm --filter @workspace/scripts run check:schema-drift
pnpm --filter @workspace/scripts run check:taxonomy-mirror
pnpm --filter @workspace/scripts run check:magic-numbers
pnpm --filter @workspace/scripts run check:migration-guards
pnpm run typecheck
pnpm --filter @workspace/calc run test
pnpm --filter @workspace/api-server run test  # if U6 added integration tests
# Then exercise the demo data path:
curl -s -b <auth-cookie> 'http://localhost:80/api/finance/compute?companyId=<demo>' | jq '.portfolio.irr'
# Expect: 0.25–0.30
```

---

## Definition of done

1. All eight units (U6, U7, U1, U2, U3, U8) committed and merged.
2. `GET /api/finance/compute` returns combined portfolio IRR ∈ [0.25, 0.30] for the demo company.
3. `docs/runbooks/seed-calibration-2026-05-13.md` records before/after IRR per property + portfolio total + Duplex override rationale.
4. `docs/concepts/bracket-mix.md` § 6a callout updated.
5. `rg -n "exit_cap_rate.*0\.0[6-9]|0\.1[0-2]|refi.*0\.[5-7]" artifacts/api-server/src/seed/ lib/db/seed/ scripts/src/ artifacts/api-server/src/routes/` returns nothing — proves no literal seed values remain.
6. Plan file `status:` flipped to `done` with completion date.

---

## Replit Agent will NOT touch this work after handoff

While CC owns U6 → U8, Replit Agent will work on a separate, non-overlapping workstream. If a question arises that needs cross-workstream coordination, leave a note on the plan file under a new `## Open Questions` section — Replit Agent watches that file.
