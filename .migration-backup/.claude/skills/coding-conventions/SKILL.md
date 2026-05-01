---
name: coding-conventions
description: Coding standards, naming conventions, and development rules for the H+ Analytics by Norfolk AI project. Use when writing new code or reviewing existing code.
---

# Coding Conventions

## General Rules
- All monetary values must be formatted with currency precision and thousands separators
- All interactive and display elements require `data-testid` attributes
- No mock or placeholder data in production paths
- Never expose or log secrets/API keys
- Legacy import paths are preserved via re-export barrels

## Component Rules
- All buttons must use `GlassButton` from `@/components/ui/glass-button`
- All pages must use `PageHeader` from `@/components/ui/page-header`
- All export functionality must use `ExportMenu` from `@/components/ui/export-toolbar`
- All tabs must use `CurrentThemeTab` from `@/components/ui/tabs`
- All image input → AIImagePicker or a wrapper (never custom upload UI)
- All entity card grids → EntityCard system from `@/components/ui/entity-card`
- Inline or ad-hoc styling is not permitted — use the shared component library

## Route Handler Rules (enforced by `tests/audit/no-raw-number-params.test.ts`)
- **All route params** must use `parseRouteId(req.params.id)` from `./helpers`. Never use raw `Number(req.params.*)`.
- **All error messages** sent to clients must use generic messages, not raw `error.message`. Use `logAndSendError()` helper.
- **All mutation endpoints** must have auth middleware (`requireAuth`, `requireAdmin`, `requireManagementAccess`).
- **All write endpoints** for shared properties must use `checkPropertyEditAccess`, not `checkPropertyAccess`.

## External Service Rules (enforced by `tests/audit/no-fetch-without-timeout.test.ts`)
- **All `fetch()` calls** in `server/integrations/` must include `signal: AbortSignal.timeout(N)`.
- **All API tokens** in `Authorization` header, never in URL query strings.
- **All DB insert/update** operations on user-controlled data must use `stripToColumns()` or Zod validation before reaching the DB.

## Finance Code Rules
- Before modifying finance code, state the Active Skill being used
- Consult relevant `.claude/skills/finance/` skill file(s) before making changes
- Do not modify accounting logic outside the allowed scope of the Active Skill
- Report violations explicitly — do not silently correct them
- Finance changes must pass verification with UNQUALIFIED result
- Agent persona: `.claude/rules/audit-persona.md` is mandatory for all finance work

## Audit Rules
- Audit doctrine: `.claude/rules/audit-persona.md` defines audit scope
- Audits must check for hardcoded values in calculation paths
- Audits must verify monthly→yearly rollup correctness
- For any "audit" request, follow the doctrine and its output format

## Button Label Rules
- All save/update buttons must display "Save" (never "Update")
- See `.claude/rules/ui-patterns.md`

## TypeScript Conventions
- Use ESM imports (no CommonJS require)
- Prefer `const` over `let`, never use `var`
- Use Zod for runtime validation of API inputs
- Use Drizzle ORM types for database operations
- Export types from `shared/schema.ts` for cross-boundary sharing

## File Naming
- Components: PascalCase (e.g., `PropertyDashboard.tsx`)
- Utilities: camelCase (e.g., `property-engine.ts`)
- Skills: kebab-case directories with `SKILL.md` (e.g., `proof-system/SKILL.md`)
- Tools: snake_case JSON files (e.g., `analyze_market.json`)

## Testing
- Test files: `*.test.ts` in `tests/` directory
- Use Vitest as the test runner
- Financial tests must verify against engine outputs, not hardcoded expected values
- Run `npm test` before committing finance changes
