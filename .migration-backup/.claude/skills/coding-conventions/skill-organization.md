# Skill File Organization Standards

> Full directory tree: `.claude/skills/` — each subdirectory has a `SKILL.md` entry point.

## Placement Rules

1. **No loose files in `.claude/skills/`** — every skill belongs in a subdirectory
2. **UI skills → `ui/`**, Finance skills → `finance/`, Research → `research/`, Testing → `testing/`
3. **Rule files → `.claude/rules/`** only; skills → `.claude/skills/` only
4. **Session history → `.claude/archive/`**, reference docs → appropriate skills subdirectory

## Naming Conventions

- Directory entry points: `SKILL.md` (uppercase)
- Sub-skills & rules: `kebab-case.md`
- Tool schemas: `kebab-case.json`

## Required Sections in Every SKILL.md

1. YAML frontmatter (`name`, `description`)
2. Purpose — what the skill covers
3. Key files — source files documented
4. Related rules — which `.claude/rules/` files govern this domain
5. Examples — usage patterns or code snippets

## Rules-to-Skills Cross-Reference

| Rule | Governs | Enforcement |
|------|---------|-------------|
| `design-standards.md` | `ui/graphics-component-catalog.md`, `ui/animation-patterns.md`, `ui/3d-graphics.md` | Every page must have graphics |
| `no-hardcoded-values.md` | `finance/*`, `architecture/multi-tenancy.md` | No literal financial or admin values |
| `recalculate-on-save.md` | `architecture/SKILL.md`, `finance/calculation-chain.md` | All saves invalidate financial queries |
| `financial-engine.md` | `finance/*` | Mandatory business rules + immutable constants |
| `database-seeding.md` | `database/SKILL.md` | Seeding invariants |
| `architecture.md` | `architecture/SKILL.md`, `architecture/source-map.md` | Stack constraints |
| `audit-persona.md` | `proof-system/SKILL.md`, `testing/SKILL.md` | Audit doctrine |
| `documentation.md` | All skills | Docs-after-edits protocol |
| `ui-patterns.md` | `ui/entity-cards.md` | Button labels + entity card layout |

## Reference Docs (load on demand)

| File | Location | Load When |
|------|----------|-----------|
| API Routes | `skills/architecture/api-routes.md` | Writing/debugging API endpoints |
| Constants tables | `skills/finance/constants-and-config.md` | Adding/changing constants |
| Verification detail | `skills/proof-system/verification-system.md` | Audit/verification work |
| Release checklist | `skills/proof-system/release-audit-checklist.md` | Pre-release reviews |
| Session history | `.claude/archive/session-memory-archive.md` | Investigating past decisions |

## When Creating New Skills

1. Check if a related subdirectory exists — use it; if not, create one with a `SKILL.md`
2. Add the skill to `context-loading/SKILL.md` task-to-skill map
3. Add a row to the Skill Router in `claude.md`
4. Reference governing rule(s) in the skill's "Related rules" section
