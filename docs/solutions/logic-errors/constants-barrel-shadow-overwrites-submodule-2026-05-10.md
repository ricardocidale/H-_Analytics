---
title: "Constants barrel re-export silently overwritten by local declaration"
date: 2026-05-10
category: docs/solutions/logic-errors/
module: constants
problem_type: logic_error
component: tooling
severity: high
symptoms:
  - "Callers receive the wrong numeric value despite the correct value existing in a sub-file"
  - "TypeScript compiles without error — the local export is valid syntax"
  - "grep for the constant finds it defined in two places with different values"
root_cause: scope_issue
resolution_type: code_fix
tags:
  - constants
  - barrel
  - export-star
  - shadow
  - typescript
  - vito
---

# Constants barrel re-export silently overwritten by local declaration

## Problem

A barrel constants file (`lib/shared/src/constants.ts`, `lib/db/src/constants.ts`) re-exports a sub-file with `export * from './sub-file'` but then also declares the same constant name locally with a different value. TypeScript resolves the local declaration as the winner, so all callers silently receive the wrong value.

In this codebase the bug manifested as `DEFAULT_STAFF_SALARY` being defined as `65_000` in `constants-staffing.ts` (authoritative) but overridden to `65000` in both barrel files. The engine and DB schema defaulted to 65,000 instead of the correct 75,000.

## Symptoms

- Two `grep` hits for the same constant name across the constants layer with different values
- Callers consistently receiving a stale/incorrect value even after the sub-file was updated
- No TypeScript error — a local `export const` in a barrel is syntactically valid even when a wildcard re-export would supply the same name
- Vito compliance audit flags the drift as a WARNING (constants declared in conflicting locations)

## What Didn't Work

Updating the value in the sub-file (`constants-staffing.ts`) alone did not fix callers — the barrel's local override continued to win. Tracing the import chain by reading import paths was not sufficient to notice the shadow.

## Solution

Remove the stale local declaration from the barrel file. The `export *` already propagates the correct value from the sub-file.

**Before** (`lib/shared/src/constants.ts` and `lib/db/src/constants.ts`):
```typescript
export * from './constants-staffing';    // exports DEFAULT_STAFF_SALARY = 75_000

// ... later in the same file ...
export const DEFAULT_STAFF_SALARY = 65000;  // ← silently shadows the re-export
```

**After**:
```typescript
export * from './constants-staffing';    // DEFAULT_STAFF_SALARY = 75_000 now wins

// comment pointing to the authoritative file if helpful:
// DEFAULT_STAFF_SALARY re-exported from constants-staffing (75_000)
```

No callers need to change — they continue to import from the same barrel.

## Why This Works

In TypeScript, when a module both re-exports a name via `export *` and declares it locally, the local declaration wins. Removing the local declaration causes the `export *` re-export to take effect. This is a pure barrel-file edit; all consumers import from the same path and see the updated value automatically.

## Prevention

1. **Grep for shadowed re-exports** before modifying constants sub-files:
   ```bash
   # Find constants that appear in both a barrel and a sub-file with export const
   grep -rn "^export const DEFAULT_" lib/shared/src/constants.ts lib/db/src/constants.ts | \
     awk -F: '{print $3}' | sort | uniq -d
   ```

2. **Vito compliance audit** flags this pattern automatically as a WARNING under the "constants declared in conflicting locations" rule. Run a manual Vito audit after any constants refactor:
   - Admin → Compliance → Run Full Audit, or
   - Rebecca: `run_compliance_audit` tool

3. **When extracting constants into a sub-file**, immediately remove the declaration from the barrel. Never add to both places — add to the sub-file, rely on the existing `export * from './sub-file'` in the barrel.

4. **Convention**: barrel files in `lib/shared/src/` and `lib/db/src/` should contain `export *` statements only. New `export const` declarations belong in the appropriate sub-file (e.g., `constants-staffing.ts`, `constants-capex.ts`).

## Related

- Vito compliance agent — periodic audit that detects this drift pattern
- `lib/shared/src/constants-staffing.ts`, `lib/db/src/constants-staffing.ts` — authoritative staffing constants
- PR #66 — the fix for `DEFAULT_STAFF_SALARY` (65k → 75k effective value)
