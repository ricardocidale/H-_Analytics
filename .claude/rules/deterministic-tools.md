# Deterministic Tool Protection

## Rule

Any change to files in `calc/` MUST be accompanied by:
1. Running `npm run test:file -- tests/calc/` (all calc tests)
2. Running `npm run verify:summary` (proof suite)
3. Verifying tool schema in `.claude/tools/` matches implementation

## Tool Registry Invariant

`calc/dispatch.ts` is the single source of truth for tool registration. There are currently **41 deterministic tools** across 6 categories:

| Category | Count | Directory |
|----------|-------|-----------|
| Research | 10 | `calc/research/` |
| Returns | 7 | `calc/returns/` |
| Validation | 5 | `calc/validation/` |
| Analysis | 11 | `calc/analysis/` |
| Financing | 6 | `calc/financing/` |
| Services | 2 | `calc/services/` |

Every tool MUST be:
- Registered in `calc/dispatch.ts` with `withRounding()` or `wrap()`
- A pure function (no I/O, no state mutation, no database access)
- Have a JSON schema in `.claude/tools/<category>/`
- Have tests in `tests/calc/<category>/`

## Adding New Tools

1. Implement in appropriate `calc/<category>/` directory
2. Register in `calc/dispatch.ts`
3. Add JSON schema to `.claude/tools/<category>/`
4. Add tests to `tests/calc/<category>/`
5. Update tool count in this file and `.claude/rules/research-precision.md`

## Enforcement

`tests/proof/tool-registry.test.ts` — verifies:
1. All tools in dispatch have matching schema files
2. All tools in dispatch have matching test files
3. Tool count matches documented count
4. No `calc/` file imports from `server/`
