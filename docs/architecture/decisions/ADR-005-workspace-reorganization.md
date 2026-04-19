# ADR-005: Workspace Reorganization — PNPM Workspaces + Turborepo

**Status:** Proposed
**Date:** 2026-04-20
**Deciders:** Claude Code (proposer), human steward, Replit Agent (executor of migration phases if accepted)
**Tags:** architecture, tooling, organization

---

## Context

The repo is currently a logical monorepo without monorepo tooling: one `package.json`, one `node_modules`, one CI pipeline, one test suite. Logical separation is maintained via TypeScript path aliases (`@/` client, `@shared/`, `@calc/`, `@engine/`, `@analytics/`, `@domain/`, `@statements/`), and rules (`.claude/rules/domain-boundaries.md`, `.claude/rules/financial-safety.md`, etc.) enforce boundaries at review time.

This setup scales well for a small team but has real frictions we're starting to hit:

1. **Test suite runtime.** ~4,391 tests across 223 files run sequentially on every commit. UI-only changes trigger the financial engine's golden tests; financial-engine changes trigger UI test runs. CI time is dominated by tests that shouldn't need to run.

2. **Dependency coupling.** Any `package.json` change affects everything. Adding a UI-only library (e.g. a new chart variant) forces the server bundle to see the version bump too. Reverse: bumping an engine-math dependency requires UI regression testing.

3. **Selective open-sourceability blocked.** `calc/` is 37 pure-function deterministic tools, no I/O, no state. A natural candidate for OSS publication as a hospitality-calculation library. Can't extract today without forking the repo.

4. **Cross-agent file collisions** (3 observed this month, now codified in `.claude/rules/agent-collision-hygiene.md`). Single `main` branch + two agents + monolithic staging = collision risk. Packages narrow the collision surface by assigning ownership: Claude Code owns `packages/vocabulary`, Replit owns `apps/server`, etc.

5. **Cognitive load on new contributors.** A new engineer reading `server/ai/` sees 41 flat files. No structure signals what's core vs incidental. Packages by concern force natural documentation — `packages/engine-analyst/README.md` states the package's job in one sentence.

We've been talking about Phase 5 "Cognitive Engine reorg (`server/ai/` 41 flat files → 6 capability folders)" for weeks. That's a subset of this ADR. Rather than do subfolder reorgs serially (`server/ai/` → later `engine/` → later `client/src/features/`), resolve the structural question once.

The earlier "kitchen organization" discussion with the human steward established the shape of this proposal but wasn't committed to formal status. This ADR formalizes it. The answer to "is this worth doing?" is the point of the ADR cycle.

---

## Decision

Adopt **PNPM workspaces + Turborepo** as the monorepo-tooling layer. Restructure the repo into a packages-and-apps layout:

```
h-analytics/
├── packages/
│   ├── calc/                # 37 deterministic tools — npm-publishable
│   ├── engine-financial/    # property + company pro-forma + verification
│   ├── engine-analyst/      # Cognitive Engine + Specialists + verdict contracts
│   ├── shared/              # schema, types, constants, citations
│   ├── ui-core/             # design-system primitives (shadcn + theme)
│   └── vocabulary/          # canonical terms, persona, voice renderer
├── apps/
│   ├── web/                 # current client/
│   └── server/              # current server/ routes + Express
├── tests/proof/             # invariant suite (cross-package)
├── docs/architecture/       # timeless (SYSTEM-MODEL, ANALYST, DEPENDENCIES, ADRs)
├── docs/runbooks/           # deployment, incident response, Sentry alerts
├── .claude/                 # agent knowledge
└── .claude/handoffs/        # session-state handoffs (move from docs/operational-tooling/)
```

**Tooling decisions:**

1. **PNPM workspaces** — not Yarn, not npm workspaces. Reasoning: PNPM's content-addressable store halves `node_modules` disk usage; hard-linking is faster on Replit's filesystem; stricter dep-hoisting prevents accidental transitive-dependency leaks between packages (which would violate our domain-boundary rules silently).

2. **Turborepo** — not Nx, not Lerna. Reasoning: Turborepo is the lightest-weight option covering 80% of the needs (task orchestration, package-level caching, remote cache). Nx's opinionated code-gen and plugin ecosystem is overkill for a six-package repo. Lerna is legacy.

3. **Single-version dependency policy.** All packages use the same versions of shared dependencies (React, Zod, Drizzle, etc.). PNPM's `workspaces.pnpmOverrides` + Turborepo's `tasks.build.dependsOn` enforce this.

4. **Per-package `package.json` stays minimal.** Only the deps the package actually imports. Hoisting via PNPM. No duplicate version management.

### Package boundaries (enforced)

- **`packages/calc`** is pure: no `server/`, no `client/`, no I/O. Existing rule `.claude/rules/deterministic-tools.md` + `tests/proof/domain-boundaries.test.ts` already enforce this; the package boundary makes it structural rather than norm-based.
- **`packages/engine-financial`** depends on `packages/calc` + `packages/shared` only. No analyst, no AI.
- **`packages/engine-analyst`** depends on `packages/calc` + `packages/shared` + `packages/vocabulary`. The Cognitive Engine façade (Phase 2+) lives here.
- **`packages/shared`** is the root dependency — imported by every package, imports none.
- **`packages/ui-core`** + **`packages/vocabulary`** are consumed by `apps/web` but never import from `apps/`.
- **`apps/web`** imports from any package; no reverse.
- **`apps/server`** imports from any package except `packages/ui-core`.

### Task-level caching

Turborepo's per-package cache means:

- UI-only changes skip `packages/engine-*` tests.
- `calc/` change triggers calc tests + financial engine tests + proof suite.
- Engine change triggers engine tests + proof suite.
- Docs-only change skips everything.

Expected CI time reduction: **~40–60% on typical UI PRs**, which dominate PR volume. Full-sweep runs (package-level changes) stay the same.

### Rules that survive, re-anchored

Existing rules migrate in place; none need rewriting:

- `.claude/rules/domain-boundaries.md` → still enforces the same prohibited crossings, now backed by package structure
- `.claude/rules/deterministic-tools.md` → `packages/calc`'s `package.json` has no `server/` deps, making the rule tautological
- `.claude/rules/financial-safety.md` → applies within `packages/calc` + `packages/engine-financial`
- `.claude/rules/balance-sheet-identity.md` → applies within `packages/engine-financial`
- `.claude/rules/agent-collision-hygiene.md` → package ownership narrows collision risk (Claude Code owns `packages/vocabulary` + `packages/shared` + `.claude/**`; Replit owns `apps/web` + `apps/server` + DB migrations)

---

## Consequences

### Positive

- **Faster CI on typical PRs.** Turborepo caches per-package. Unchanged packages skip tests.
- **Selective open-sourcing becomes feasible.** `packages/calc` can be published to npm as `@norfolk/calc-hospitality` once stable. Business logic in `packages/engine-analyst` stays proprietary.
- **Independent versioning.** The financial engine gets its own SemVer. Breaking changes require ADR. UI rev cycles don't force engine bumps.
- **Team scaling.** A future engineer can own `packages/engine-financial` without needing to grok Rebecca's chat UI. Today, understanding anything requires understanding everything.
- **Reduced cross-agent collisions.** Package ownership + feature branches per agent = natural separation.
- **41-flat-files problem disappears.** `server/ai/` becomes `packages/engine-analyst/src/{cognitive,surfaces,voice,quality,contracts,router,version}/` with README per capability.

### Negative

- **One-week migration window.** Phase 1 (workspace bootstrap) is risk-free but takes a day. Phase 2 (`engine-analyst` split from `server/ai/`) is the real work — a week with Replit owning execution, Claude Code owning the reorg plan.
- **Import-path churn.** Every import from `@shared/`, `@calc/`, `@engine/` changes to `@h-analytics/shared`, `@h-analytics/calc`, etc. (or similar; naming in the scoped-package convention). Mechanical but wide-reaching. Mitigation: a `tsconfig.json` path-alias keeps the old `@shared/*` paths working as aliases to the new package during migration; drop the aliases in a follow-up commit once all imports are migrated.
- **Replit build pipeline touch.** `npm run build` becomes `pnpm -w build` or `turbo build`. Replit's deployment uses `node ./dist/index.cjs`; that stays, but the build step changes. Needs coordination with Replit's `.replit` file.
- **Added tool dep: Turborepo.** One more thing to keep current (vs. zero tools today). Mitigation: Turborepo is stable; breaking changes are rare.
- **Initial cognitive load on existing contributors.** "Why are imports from `@h-analytics/calc` instead of `@calc/`?" "Where does the new code go?" Mitigation: comprehensive README in the root explaining the layout + Turborepo migration doc.

### Neutral / Notable

- **Not a microservices move.** Deployment stays monolithic. `apps/server` is one Express app, one container, one Replit deployment. Autoscale handles current load.
- **Not a separate-repos move.** Packages stay in the monorepo. Extraction to separate repos is a future option (Phase 4 in the migration plan), not this ADR's scope.
- **Not Nx.** Turborepo is strictly lighter-weight. Revisit if we outgrow Turborepo (6+ packages, ≥ 3 apps, heavy code-gen).
- **Tests stay co-located with code.** `packages/calc/src/research/compute_adr_projection.ts` + `packages/calc/tests/research/compute_adr_projection.test.ts`. Cross-package proof tests stay in root `tests/proof/`.

---

## Alternatives considered

### Alternative A: Keep monolithic, do `server/ai/` subfolder reorg only

Reject. That's the minimum-viable version (Phase 5 of the Analyst architecture). But it leaves all the other frictions (shared `package.json`, slow CI, cross-agent collisions, blocked OSS path) unresolved. If we're going to restructure, structure the whole thing once.

### Alternative B: Multi-repo split (packages → separate repos)

Reject. Versioning hell, PR-across-repos friction, synchronized-change pain, CI setup 4× as complex. The fault lines aren't proven stable enough to warrant separation. Revisit after 6+ months of stable package boundaries.

### Alternative C: Nx instead of Turborepo

Reject. Nx is heavier-weight than we need. Code generation, plugin ecosystem, opinionated file layout — overkill for a 6-package repo. Turborepo covers task orchestration + caching + remote cache, which is 80% of the benefit at 20% of the complexity.

### Alternative D: Yarn workspaces

Reject. PNPM is strictly better for Replit's filesystem (hard-linking, smaller `node_modules`), enforces stricter dep boundaries, and the `pnpm-workspace.yaml` config is more explicit than Yarn's `workspaces` glob list.

### Alternative E: Wait until the team grows

Reject. "Wait for pain to be bigger" is a good heuristic for speculative tooling investments. But we're already paying the costs (slow CI, collisions, blocked OSS). The migration cost now (~1 week) is the same as the migration cost later when 2× the code has 2× the imports to update. Earlier is cheaper.

---

## Implementation phases

Each phase is independently committable. Halting between phases is safe.

### Phase 1 — Bootstrap (1 day, Replit + Claude Code collaboration)

1. Add `pnpm-workspace.yaml` + `turbo.json` at root.
2. Migrate root `package.json` to reference workspace packages.
3. No code move yet — every existing dir stays put. `tsconfig.json` path aliases point to existing locations.
4. Verify `pnpm install` + `turbo build` + `turbo test` replicate current behavior.
5. Commit. Replit deploys. Production unchanged.

**Exit criterion:** current test suite passes unchanged on `pnpm test` + `turbo test`. No behavior change.

### Phase 2 — Extract `packages/shared` (2–3 days, Replit)

1. Move `shared/` to `packages/shared/src/`.
2. Add `packages/shared/package.json` with dependencies.
3. Update imports: `@shared/*` → `@h-analytics/shared/*` (or keep `@shared/*` as alias during migration).
4. Every other consumer becomes a workspace-dependent package.
5. Commit.

**Exit criterion:** UI + server + engine + calc + tests all import from `@h-analytics/shared`. Old `@shared/*` aliases removed.

### Phase 3 — Extract `packages/calc` (2 days, Replit)

Similar pattern. This is the OSS-candidate package. Ensure `package.json` publishing metadata (description, repository, license, keywords) is set even if we don't publish immediately.

### Phase 4 — Extract `packages/engine-financial` (3 days, Replit + Claude Code)

Move `engine/` + `financial/` + `statements/` + `analytics/` into `packages/engine-financial/src/`. This is the biggest single extraction. Claude Code provides the move plan + import-rewrite script; Replit executes.

### Phase 5 — Extract `packages/engine-analyst` (3 days, Replit + Claude Code)

Move `engine/analyst/` + `server/ai/` → `packages/engine-analyst/src/`. Finally resolves the 41-flat-files problem. Subfolders: `cognitive/`, `surfaces/`, `voice/`, `quality/`, `contracts/`, `router/`, `version/`, `prompts/`. Each with a README.

### Phase 6 — Extract `packages/ui-core` + `packages/vocabulary` (2 days, Replit)

`client/src/components/ui/` + `client/src/lib/design-system/` → `packages/ui-core/`. Voice renderer + branded string types → `packages/vocabulary/`.

### Phase 7 — `apps/web` + `apps/server` (2 days, Replit)

Move remaining `client/` → `apps/web/`, `server/` → `apps/server/`. At this point the root is only `packages/`, `apps/`, `tests/proof/`, `docs/`, `.claude/`.

### Phase 8 — Documentation + CI optimization (1 day, Claude Code)

Root README rewrite. Per-package READMEs. Turborepo remote cache configuration (if beneficial). Update `.claude/skills/architecture/SKILL.md` and related skills to reflect the new layout.

**Total:** ~2 weeks of focused work spread across Replit execution + Claude Code planning.

---

## Acceptance criteria

This ADR transitions Proposed → Accepted when:

1. Human steward signs off on the package boundaries.
2. Phase 1 lands cleanly (no test regressions, no deploy regressions) — validates the tooling choice.
3. Phase 2 lands cleanly — validates the package-extraction pattern.

If either Phase 1 or Phase 2 fails, ADR goes back to Proposed and we reconsider.

---

## Open questions

1. **Package namespace:** `@h-analytics/*`? `@norfolk/*`? `@internal/*`? Namespace affects npm publishing if `packages/calc` ever goes OSS. Recommend `@norfolk/*` since Norfolk AI is the brand; `calc` as `@norfolk/calc-hospitality` is clean.

2. **Does Replit's deployment config need updating?** `.replit` file + `npm run build` script need adjustment for Turborepo. Replit should confirm feasibility during Phase 1.

3. **Single-version dep policy vs per-package freedom.** Strict single-version is safer but can force unrelated upgrades. Per-package version freedom is riskier but more flexible. **Recommend strict single-version** for the first year — if it becomes a bottleneck, relax it later.

4. **Test co-location:** tests in `packages/<x>/tests/` (co-located) vs root `tests/`? Recommend co-located for unit + integration; keep `tests/proof/` at root since proof tests are cross-package invariants.

---

## Related

- **Prior discussion:** the "kitchen organization" exchange with the human steward (April 2026 session memory).
- ADR-001 — two-tier Analyst architecture (Accepted)
- ADR-002 — `engine/analyst/` skeleton (Accepted) — will need a packages-layout amendment if this ADR accepts
- ADR-003 — AnalystVerdict contract (Accepted) — stable across the move
- ADR-004 — verdict cache (Proposed) — packages layout is orthogonal to cache decision
- `.claude/rules/claude-replit-split.md` — agent-domain split; packages formalize it structurally
- `.claude/rules/agent-collision-hygiene.md` — collisions narrow to per-package
- `.claude/rules/domain-boundaries.md` — boundaries become physical (package.json) not just normative
- `docs/architecture/SYSTEM-MODEL.md` — day-one doc; needs a post-migration amendment section
- `docs/architecture/DEPENDENCIES.md` — dep atlas; move to per-package dep tables
