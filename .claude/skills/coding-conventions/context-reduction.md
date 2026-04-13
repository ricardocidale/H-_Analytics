# Context Reduction Through Skills & Helpers

## Rule

Every refactor, feature addition, or significant code change MUST produce supporting artifacts that reduce future context loading requirements. The goal: any future agent session can work on a specific area by loading a focused skill file instead of reading thousands of lines of source code.

## Required Artifacts

### After Refactoring (splitting files, extracting components)

1. **Architecture skill** — Document the new component structure, file map, prop interfaces, and data flow. Place in `.claude/skills/<domain>/` (e.g., `.claude/skills/admin/admin-refactor-map.md`).
2. **Extraction guide** — If the pattern is reusable, document the extraction methodology for future similar work. Include import mappings, query key conventions, and mutation invalidation patterns.
3. **Barrel exports** — Create `index.ts` files for clean imports from component directories.

### After Adding Features

1. **Feature skill** — Document the feature's architecture, key files, API endpoints, and UI components. Include examples.
2. **Helper functions** — Extract reusable logic into shared utilities (e.g., `lib/`, `hooks/`, `utils/`). Document them in the relevant skill.
3. **Type definitions** — Extract shared interfaces into `types.ts` files in the component directory.

### After Creating Reusable Patterns

1. **Pattern skill** — Document the pattern with usage examples so it can be applied elsewhere without re-reading the original implementation.
2. **Scripts/tools** — If a task is repeatable (verification, seeding, auditing), create a script in `scripts/` or a tool schema in `.claude/tools/`.

## Why

- Chat history resets between sessions. Skills are the only persistent implementation knowledge.
- Loading a 50-line skill file costs ~50 tokens. Reading a 1,600-line source file costs ~4,800 tokens.
- Focused skills allow parallel subagent work — each subagent loads only the skills it needs.
- Helper functions reduce duplication and keep component files small.
- Scripts automate repetitive tasks and eliminate manual steps.

## Verification

After any significant refactor or feature addition, verify:
1. A skill file exists documenting the new structure
2. Shared types are extracted (not duplicated across files)
3. Helper functions are in shared locations (not inline)
4. The context-loading skill (`context-loading/SKILL.md`) maps to the new skills
5. `claude.md` references the new structure
