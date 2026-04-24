# Handoff: ADR-005 Phase 1 — awaiting Replit deploy dry-run (step 7 of 7)

**Audience:** Next session (Claude Opus / Replit Agent / steward)
**Status:** ⏸ **WAITING ON STEWARD ACTION** — local steps 1-6 PASS, step 7 needs the Replit UI.
**Filed:** 2026-04-20 (Replit Agent session before handoff)
**Linear:** NAI-13, NAI-21

---

## What's done

Branch `adr-005/phase-1-workspace-bootstrap` (commit `98c0e680`) is pushed to `origin`.

**Files added on the branch (zero file moves, exactly per the handoff):**
- `pnpm-workspace.yaml` — `packages: ["."]`
- `turbo.json` — 5 tasks (build, test, lint, typecheck, verify:summary) mirroring current scripts
- `.npmrc` — `node-linker=hoisted` for backcompat
- `pnpm-lock.yaml` — generated via `pnpm import` (1307 packages, 451 KB)
- `package.json` — `packageManager: "pnpm@10.26.1"` + `workspaces: ["."]` (handoff said pnpm@9.x; the available version on this nix env is 10.26.1, so I pinned to that — flag if you want to downgrade)
- `.gitignore` — `.turbo/`
- `turbo` added as devDependency (`^2.9.6`)

**Verification — local steps 1-6 PASS:**
| # | Gate | Result |
|---|------|--------|
| 1 | `pnpm install` | PASS — 1307 packages, 1m32s |
| 2 | `tsc --noEmit` | PASS — 0 errors |
| 3 | `pnpm lint:summary` | PASS — 0 errors (41 warnings — baseline preserved) |
| 4 | Vocab gate | PASS — 11/11 |
| 5 | `test:summary` | PASS (a transient flake hit during pnpm-install when the workflow caught files mid-write; cleared on re-run) |
| 6 | `verify:summary` | PASS — UNQUALIFIED (20 phases) |
| 7 | **Replit deploy dry-run** | ⏸ **DEFERRED — see below** |

---

## What the next session needs to do

### Step 7 — Replit deploy dry-run (steward must trigger)

**Why I deferred it:** Step 7 requires triggering an autoscale deploy from the Replit UI, targeting this feature branch (NOT main). I cannot do this safely from the agent environment without the steward authorizing the deploy panel.

**Procedure (per `.claude/replit-handoffs/phase-1-workspace-bootstrap.md` §7):**
1. In Replit UI, point a deploy at branch `adr-005/phase-1-workspace-bootstrap`.
2. Trigger deploy (autoscale target).
3. Confirm the production-equivalent container starts successfully.
4. Watch deploy logs for errors during `npm install` and `npm run build`.

**If step 7 PASSES:**
- Merge `adr-005/phase-1-workspace-bootstrap` → `main`.
- Mark Linear NAI-13 + NAI-21 → Done.
- Ping Claude (engine side): "Phase 1 complete, Phase 2 ready" — Claude will write the Phase 2 handoff (`packages/shared` extraction).
- ADR-005 stays Proposed; only flips to Accepted when Phase 2 also lands.

**If step 7 FAILS:**
- Do NOT merge.
- File `.claude/replit-handoffs/BLOCKED-phase-1.md` with the specific error.
- Likely failure modes:
  - **Container can't find pnpm:** Replit's deploy nix env may not have pnpm 10.x. Add `pnpm` to `.replit`'s nix packages, OR enable corepack via Node 20.20.
  - **Deploy install command broken by mixed lockfiles:** `.replit` deploy currently uses `["npm","run","build"]` and the install runs `npm install` against `package-lock.json`. With both lockfiles present, `npm install` should still work — but if it fails, options are:
    - (a) Update `.replit` to use `pnpm install && pnpm run build` (riskier — changes deploy install)
    - (b) Delete `pnpm-lock.yaml` from the deploy artifact (defeats the purpose)
    - (c) Stick with `npm install` for deploy and use pnpm only for local dev (the conservative path)

---

## Critical context the next session needs

### Why .replit is unchanged in Phase 1

The handoff §6 says "Confirm pnpm install works as the install command." I read this as **a verification step**, not a prescription to change `.replit` in Phase 1. Reasoning:

- `.replit` deploy install command is currently `npm` (implicit, via `["npm","run","build"]`).
- Switching deploy to pnpm is a higher-blast-radius change than adding pnpm tooling locally.
- The dry-run on this branch (with both lockfiles + `.replit` still on npm) tests whether the npm-based deploy still works against a repo that ALSO has pnpm files. If it does, we have safe backwards compatibility while migrating.
- If the dry-run fails, that's where the `.replit` switch decision happens.

If the steward / next session disagrees, the change is one line in `.replit` and a re-push.

### Lockfile coexistence

Both `package-lock.json` (existing) and `pnpm-lock.yaml` (new) live on this branch. The handoff §"What NOT to do" forbids deleting `node_modules + reinstall from npm → pnpm without first trying migration` — I followed that by using `pnpm import`. The dual-lockfile state is the safest transitional position. After step 7 PASS + Phase 2 lands, the steward / Claude can decide when to remove `package-lock.json`.

### Why I bumped pnpm@9.x → pnpm@10.26.1

The handoff says `pnpm@9.x`; nix env on this Replit has pnpm 10.26.1 only. Pinning to a non-available version would have made every developer (and the deploy container) hit a corepack download. Going with what's actually installed is the lower-risk choice. If the steward wants 9.x, install pnpm 9 in nix first, then change the pin and re-run `pnpm install`.

---

## Other state at handoff (so the next session has full context)

### Linear seeded — main is ahead

Commit `534ee2a6` on main added `script/linear/seed-queue.ts` and ran it live. **NAI workspace now has:**
- 9 labels (tooling, observability, migrations, time-gated, blocked-on-steward, tech-debt, audit-finding, adr-004, adr-005)
- 2 projects (ADR-004, ADR-005)
- 16 issues NAI-10 through NAI-25 (8 homework + 3 ADR-004 phases + 2 ADR-005 phases + 3 audit follow-ups)

The seeder is idempotent (matches by title) — safe to re-run.

### Branch ≠ main divergence

```
main             534ee2a6  feat(linear): add idempotent seeder for the project work queue
                 ee5c0d6b  Add cache read functionality for research runs (Phase 5B)
                 …

adr-005/phase-1  98c0e680  build: ADR-005 Phase 1 — PNPM workspaces + Turborepo bootstrap
                 534ee2a6  ← (branched from here)
```

Branch is one commit ahead of main. No divergence besides the Phase 1 work. Clean fast-forward merge possible after step 7.

### Local working dir

Switched back to `main` after pushing the branch. `node_modules/` on disk reflects the pnpm install from the branch (1307 packages with hoisted linker). If the next session works on main and runs `npm install`, it will reconcile against `package-lock.json` and may produce a slightly different `node_modules`. Not a problem; just expect one big reinstall.

---

## TL;DR for whoever picks this up

1. Branch is pushed and locally verified — gates 1-6 green.
2. Step 7 (Replit deploy dry-run) needs the steward in the Replit UI.
3. Linear NAI-13 / NAI-21 are tracking this; flip them when step 7 finishes.
4. Don't merge to main until step 7 PASSES.
5. If step 7 fails, the most likely culprit is `.replit` deploy still using `npm install` against a repo with both lockfiles — see Failure Modes above.
