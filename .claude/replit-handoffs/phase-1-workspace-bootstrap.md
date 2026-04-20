# Handoff: ADR-005 Phase 1 — Workspace Bootstrap

**Audience:** Replit Agent
**Status:** Ready to execute when steward authorizes
**Owner:** Replit (owns `.replit`, `package.json`, build pipeline per claude-replit-split.md)
**Risk:** Low — Phase 1 adds workspace tooling but moves zero files. Worst case: rollback is `rm -rf pnpm-workspace.yaml turbo.json && git checkout package.json`.
**Prereq:** Steward authorization to start ADR-005 execution (ADR still Proposed per its own acceptance criteria; Phase 1 + 2 landing cleanly is what transitions it to Accepted).

---

## Goal

Add monorepo tooling (PNPM workspaces + Turborepo) **without moving any file**. Every existing directory stays where it is. Every existing test and import works unchanged. `pnpm install` + `turbo build` + `turbo test` reproduce today's behavior on CI and Replit deploy.

The point of Phase 1 is to **prove the tooling works** in this repo. If `pnpm install` breaks Replit's build, we roll back. If it all passes, Phase 2 (extract `packages/shared`) starts with confidence in the toolchain.

---

## What to add

### 1. `pnpm-workspace.yaml` (repo root)

Initially minimal — lists the one "workspace" which is just the repo root itself:

```yaml
packages:
  - "."
```

After Phase 2 lands, this grows to include `packages/*` and `apps/*`. Phase 1 keeps it pointing at the root so nothing else changes.

### 2. `turbo.json` (repo root)

Mirror today's npm scripts as Turborepo tasks:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "outputs": ["dist/**", ".tsbuildinfo"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "outputs": [".tsbuildinfo"]
    },
    "verify:summary": {
      "dependsOn": ["build"],
      "outputs": ["test-artifacts/**"]
    }
  }
}
```

Keep the `$schema` line — Turborepo reads JSONSchema for editor autocomplete.

### 3. `package.json` adjustments

- Keep the existing `"name": "hospitality-business-portal"` (don't rename in Phase 1).
- Add `"workspaces": ["."]` if needed (PNPM reads `pnpm-workspace.yaml` as the primary config; npm + yarn read `workspaces` in `package.json`). Safe to add both.
- Add `"packageManager": "pnpm@9.x"` (whatever the current PNPM major is — pick the one you're using locally).
- Add a `.npmrc` at root if not present: `node-linker=hoisted` for the Phase 1 compatibility window. We want hoisted linking so existing imports don't break. PNPM's default (`isolated`) would break them. We'll revisit once we're on Phase 3+.

Do NOT yet change existing scripts to `turbo <task>` — leave `"build": "..."`, `"test": "..."` as-is. Turborepo picks them up by name automatically once you invoke `turbo build` / `turbo test`.

### 4. Add `turbo` + `pnpm` as dev deps

```bash
pnpm add -D turbo
```

(PNPM itself is installed globally by the `packageManager` field in corepack-supporting environments; no need to add as a dep.)

### 5. `.gitignore` additions

```
.turbo/
```

Turborepo caches go in `.turbo/` at root; never commit them.

### 6. Replit `.replit` file — review + adjust

The current deploy script is whatever `npm run build && node dist/index.cjs` (or equivalent) does. Confirm that:
- `pnpm install` works as the install command.
- The build command still produces `dist/index.cjs` (or whatever the current deploy expects).
- No breakage in Replit's autoscale deployment.

If any of these break, that's a Phase 1 rollback trigger — not a block on the ADR itself, but a signal to resolve before we can continue.

---

## Verification (mandatory before commit)

1. **Install works:** `pnpm install` completes without errors. `node_modules/` is populated.
2. **TS compiles:** `npx tsc --noEmit` — zero errors. (Current baseline: 0 errors.)
3. **Lint passes:** `pnpm lint` — 0 errors (current: 40 warnings, OK to keep).
4. **Vocab gate:** `pnpm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 PASS.
5. **Full test suite via turbo:** `turbo test` — replicates today's `npm test` output. All test files pass.
6. **Verify suite via turbo:** `turbo verify:summary` — Opinion UNQUALIFIED across all 19 phases.
7. **Replit deploy dry-run:** trigger a deploy on a feature branch; confirm production-equivalent container starts. Don't deploy to main.

If all 7 pass → commit Phase 1 and move to Phase 2 handoff (Claude will write that once this lands).

If any step fails → stop, file `BLOCKED-phase-1.md` sibling to this handoff documenting which step broke and the error, and flag back for Claude Code to revise.

---

## Commit convention

```
build: ADR-005 Phase 1 — PNPM workspaces + Turborepo bootstrap

Add pnpm-workspace.yaml (single-root for now), turbo.json (mirroring
current npm scripts as tasks), .npmrc (hoisted node-linker for
backcompat during migration), packageManager pin, .gitignore for
.turbo cache dir.

No file moves. No import changes. All existing scripts keep working
via pnpm + turbo wrappers.

Verified: pnpm install PASS, tsc 0 errors, pnpm lint 0 errors,
11/11 vocab, turbo test PASS, turbo verify:summary UNQUALIFIED,
Replit deploy dry-run PASS on feature branch.

Ref: docs/architecture/decisions/ADR-005-workspace-reorganization.md
     §Phase 1 + Open-question resolutions (2026-04-20)

Surfaces: S2 (build), S8 (tooling), S14 (CI)

Replit-Commit-Author: Agent
```

---

## After Phase 1 lands

Post a note in `.claude/session-memory.md`:

> "ADR-005 Phase 1 shipped as `<sha>` — PNPM + Turborepo bootstrap, zero file moves. Phase 2 (`packages/shared` extraction) next; Claude Code to write the handoff."

Claude will then:
1. Write Phase 2 handoff with exact file-move plan for `shared/` → `packages/shared/src/`.
2. Provide an import-rewrite script (jscodeshift or regex) that converts `@shared/*` → `@norfolk/shared/*` in one pass.
3. List every consumer of `@shared/*` (there are many) so the rewrite can be audited.

Phase 2 is where the real import churn starts. Phase 1 is confidence-building.

---

## What NOT to do in Phase 1

- ❌ Do NOT move any file.
- ❌ Do NOT rename the root package from `hospitality-business-portal` yet.
- ❌ Do NOT change any import path.
- ❌ Do NOT delete `node_modules` + reinstall from npm → pnpm without first trying migration; use `pnpm import` if an existing `package-lock.json` can seed the `pnpm-lock.yaml`.
- ❌ Do NOT add workspace dependencies across packages yet — there's only one package (root) in Phase 1.

---

## References

- ADR-005 — `docs/architecture/decisions/ADR-005-workspace-reorganization.md` (Proposed; Phase 1 + 2 completion transitions to Accepted per §Acceptance criteria)
- `.claude/rules/claude-replit-split.md` — package-level changes are Replit's
- `.claude/rules/pre-commit-verification.md` — five gates are BLOCKING for this commit
- Open questions resolved 2026-04-20 — see ADR §"Open questions — resolved"
- PNPM docs: https://pnpm.io/workspaces
- Turborepo docs: https://turbo.build/repo/docs
