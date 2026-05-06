# H+ Analytics — Agent Rules

These rules apply to every session, every agent, every plan and implementation unit.
They are non-negotiable. Skills (`no-magic-numbers`, `hplus-variable-taxonomy`) provide
full documentation; this file is the always-loaded enforcement reminder.

---

## 1. Magic Numbers — MANDATORY GATE

**Every implementation unit that touches any numeric literal MUST run:**

```
scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts
```

This is the hard gate. It must PASS before the unit is considered done.

**The rule (one sentence):** Every numeric literal in source code must be either a named
constant, a math/physics derivation with its formula in a comment, a documented unit
conversion factor, or a structural index/length/clamp (`0`, `1`, `-1`). Anything else
is a violation.

**When to include in a plan's verification section:** Every unit. If the unit adds no
numeric literals, the gate still runs to catch regressions. There are no exceptions.

**Skill for full detail:** `.agents/skills/no-magic-numbers/SKILL.md`

---

## 2. Number Taxonomy — FOUR CATEGORIES ONLY

Every number falls into exactly one category. Never invent a fifth.

| Category | Name | Pattern |
|---|---|---|
| 1 | TRUE CONSTANTS | Math/physics only. `DAYS_PER_MONTH = 30.5 // 365/12` |
| 2 | DEFAULT VARIABLES | Admin-controlled starting values. `DEFAULT_*` in `constants*.ts` |
| 3 | ASSUMPTION VARIABLES | Per-entity DB values. Read from DB, fallback `?? DEFAULT_*` |
| 4 | TABLE-SOURCED VALUES | Authority rates (tax, inflation, depreciation). `getMarketRate()` or `getFactoryNumber()` |

**Masking anti-pattern — never do this:**
```ts
const DEFAULT_INFLATION_RATE = 0.03;  // still a magic number one level up
```

**Skill for full detail:** `.agents/skills/hplus-variable-taxonomy/SKILL.md`

---

## 3. Seed File Rule

Seed files MUST import and reference `DEFAULT_*` constants or named `SEED_*` constants.
**Never write a raw numeric literal in a seed file.** Raw literals break the
single-source-of-truth chain and cause silent drift.

```ts
// CORRECT
const SEED_EXIT_CAP_RATE_US = 0.075;
{ exitCapRate: SEED_EXIT_CAP_RATE_US }

// VIOLATION
{ exitCapRate: 0.075 }
```

---

## 4. ADR-007 — DI Discipline in Calc/Engine

`lib/calc/src/` and `lib/engine/src/` MUST NOT import storage, DB, or logger.
All rate resolution happens in the **route/service layer** and is passed as parameters
to pure calc functions.

```ts
// CORRECT — route resolves, passes in
const rate = await getMarketRate('transfer_tax_us');
computeExitScenarios({ transferTaxRates: { transfer_tax_us: rate.value / 100 } });

// VIOLATION — calc imports storage
import { getMarketRate } from '../../storage/market-rates';
```

---

## 5. Plan Verification Gate Checklist

Every implementation unit's Verification section must include:

- [ ] `pnpm run typecheck` (or scoped `tsc --noEmit`) — clean
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- [ ] Relevant test suite — PASS

Units that modify DB schema or seed files also need:
- [ ] `pnpm --filter @workspace/scripts run check:migration-guards` — PASS

---

## 6. Institutional Knowledge Store

`docs/solutions/` contains documented solutions, architecture patterns, design decisions, and
workflow learnings accumulated across sessions. Search it before implementing features, debugging
issues, or making decisions in a documented area.

**Structure:** Organized by category subdirectory (`architecture-patterns/`, `design-patterns/`,
`best-practices/`, etc.). Each file has YAML frontmatter with searchable fields:
- `module` — the area affected (e.g., `rebecca-agent-native-architecture`, `admin-navigation`)
- `tags` — lowercase-hyphen keywords
- `problem_type` — category enum (`architecture_pattern`, `design_pattern`, `best_practice`, etc.)

**When to search:** Before starting any implementation unit, grep for relevant module names,
tags, or component names in `docs/solutions/`. Learnings may cover bugs, patterns, workflow
conventions, and architectural decisions that would otherwise be re-discovered.

---

## 7. Agent-Native Parity — Mandatory Discipline

Every UI action a user can take, Rebecca must be able to achieve through conversation.

**When adding any UI capability**, also add the corresponding Rebecca tool in the same PR
and update `docs/discipline/agent-native-parity-map.md`.

**Parity map status values:**
- ✅ Tool exists and is documented in Rebecca's system prompt
- ⚠️ UI action exists but no Rebecca tool — MUST be resolved before merging
- 🚫 N/A — user-only action (file picker, camera, biometric auth) or admin-only

**The parity audit skill:** run `/parity-audit` in any session to get a structured
gap analysis comparing the current UI action list against known Rebecca tools.

---

## 8. Market Rates Table — Admin Regenerates, Never Cell-Edits

The admin can only press the **Analyst button** to regenerate an entire table row.
Individual cell editing is not supported and must not be implemented. Tables show:
- Last-regenerated timestamp
- Freshness dot (green = fresh, yellow = aging, red = stale/overdue)

---

## 9. Financial Engine Authoring Authority — ONLY shell CC

**Only the Claude Code CLI session (shell CC) may edit code in the financial engine
surface.** Replit Agent, other AI agents, and execute-this-plan handoffs must NOT
touch this surface — neither directly nor via plan delegation.

**Protected surface:** `lib/engine/src/`, `lib/calc/src/`, `lib/shared/src/constants*.ts`,
`lib/db/src/constants*.ts`, `artifacts/api-server/src/finance/`,
`artifacts/api-server/src/report/`, `artifacts/api-server/src/tests/proof/`,
`artifacts/api-server/src/tests/engine/`. Schema columns that feed these are
protected at the column level, not just the read site.

**The discipline:** when handing a plan to a non-shell-CC agent, the plan's file
scope MUST exclude every path above. Saying "do not touch the engine" in the
prompt is insufficient — exclude it from scope. If the plan needs an engine
change, carve that unit out and execute it as shell CC.

**Why:** financial correctness is the product's integrity surface. Drift in PMT,
amortization, NOI, debt-service, fee, or rollup math compounds across every
projection. Single-hand authorship preserves audit trails and prevents
context-poor agents from breaking invariants. This rule governs *who* writes;
ADR-007 (Section 4) and the Determinism invariant govern *what* the code does.

**Skill for full detail:** `.agents/skills/financial-engine/SKILL.md` —
"Critical Invariant: Authoring Authority" section.

---

## 10. Agentic Member Naming Convention

All agents, minions, and orchestrators in H+ Analytics use human first names
from Brazilian or Italian naming traditions (male or female).

**Three roles — never conflate:**
- **Orchestrators** — route work across agents; never produce content directly
- **Agents** — do the substantive work (LLM or deterministic)
- **Minions** — deterministic helpers called by agents; no LLM, no judgment

**Name formats:**
- **Swarm agents** (job-specific, only used in one pipeline): `Name-NN`
  zero-padded (e.g., Sofia-01, Lorenzo-03)
- **Cross-app specialists** (used in multiple surfaces): single name (e.g., Maya, Lucca)
- **Orchestrators and minions**: single name

**Every member has three fields:**
- `role` — one-line title (e.g., "Slide 1 Builder")
- `short_description` — 1-2 sentences for card/list views
- `long_description` — full capabilities, inputs, outputs, model tier

**Reserved names (already in use — never reuse):**
- App agents: Rebecca, Iris
- Analyst orchestrator: Gustavo
- Research specialists: Ana, Bia, Cecília, Mariana, Natália, Olívia, Paula,
  Daniela, Eloá, Fernanda, Giovanna, Helena, Isadora, Júlia, Kamila, Letícia
- Slide factory orchestrator: Marco
- Slide factory cross-app: Lucca, Maya
- Slide factory swarms: Lorenzo, Sofia, Bianca, Chiara, Dario, Elisa, Felix
- Slide factory minions: Aldo, Bruno, Carlo, Dino, Enzo

**Never use:** Sergio, Milton

**Skill for full detail:** `.agents/skills/slide-factory/SKILL.md`
