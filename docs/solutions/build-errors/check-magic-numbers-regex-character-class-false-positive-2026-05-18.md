---
title: check-magic-numbers falsely extracts trailing digit from regex character-class range
date: "2026-05-18"
category: build-errors
module: check-magic-numbers
problem_type: build_error
component: tooling
severity: high
symptoms:
  - Gate fails with REGRESSION on literal 9 (or any digit ending a character-class range like 0-9) even when the file contains no business-logic numbers
  - Reported offending literal is a single digit with no indication it originates inside a regex character class
  - Failure reproducible with any Zod .regex() call using a digit-range character class such as /^[a-z0-9]+.../
root_cause: logic_error
resolution_type: code_fix
tags:
  - check-magic-numbers
  - zod
  - regex
  - false-positive
  - mandatory-gate
  - ratchet
  - character-class
---

# check-magic-numbers falsely extracts trailing digit from regex character-class range

## Problem

The `check-magic-numbers.ts` mandatory gate flags the digit `9` (or any digit ending a character-class range like `0-9`) as a standalone magic-number literal when a regex literal containing that range appears in a source file. Adding a Zod `.regex()` validator with a pattern like `/^[a-z0-9]+.../` causes the gate to fail even though no business-logic number was introduced.

## Symptoms

Exact failure output when the file adds a Zod `.regex()` with a digit-range character class:

```
REGRESSION  9: 37 → 38 files (+artifacts/api-server/src/routes/admin/fees.ts)
check:magic-numbers  FAIL — 1 issue(s) (0 DB-candidate, 1 ratchet regression(s))
```

- Reported literal is a single digit (`9`, `6`, etc.)
- No indication in the output that the digit lives inside a regex character class
- The file may contain no business-logic numbers at all

## What Didn't Work

- **Named constant at the call site** — only partially correct. Extracting the regex to a `const` only suppresses the false positive if the constant name is `ALL_CAPS` and the pattern appears only in the definition line. If the literal appears inline at the usage site (e.g., `z.string().regex(/^[a-z0-9]+.../)`) the false positive still fires. The correct approach is to reference the constant *by name* at the call site.
- **Widening the character class** (e.g., `[a-zA-Z-]+`) — changes validation semantics and still triggers for any range whose last character is a digit.
- **Running `--init` to reset the ratchet** — only appropriate when the file genuinely contains no magic numbers. Resetting the baseline for a false positive also silently masks any real violations added to the same file in the future.

## Solution

**Option 1 — Drop `.regex()` entirely (preferred when length constraints suffice)**

```ts
// Before — triggers false positive:
slug: z.string().min(1).max(VARCHAR_SHORT_MAX).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case"),

// After — clean:
slug: z.string().min(1).max(VARCHAR_SHORT_MAX),
```

Leave format enforcement to convention and the DB unique constraint.

**Option 2 — Extract to an `ALL_CAPS` named constant (when format validation is required)**

The checker skips `const ALL_CAPS = value` definition lines. Referencing the constant by name at the call site removes the inline regex literal.

```ts
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // definition line — skipped by checker

slug: z.string().min(1).max(VARCHAR_SHORT_MAX).regex(SLUG_PATTERN, "Slug must be lowercase kebab-case"),
```

## Why This Works

The checker's numeric literal extractor uses this lookbehind to detect standalone digits:

```
/(?<![a-zA-Z_$0-9#])(\d+(?:\.\d+)?)(?![a-zA-Z_%])/g
```

The lookbehind excludes letters, underscores, `$`, existing digits, and `#` — but **not** the dash `-`. In the character class `/^[a-z0-9]+.../`, the range `0-9` has the digit `9` preceded only by `-`. Because `-` is absent from the lookbehind exclusion set, the extractor treats `9` as a standalone numeric literal.

The key context: string literals (`"..."`, `'...'`, `` `...` ``) are stripped before extraction. Regex literals (`/.../`) are **not** stripped — they remain in the scanned line, making any digit after a dash in a character-class range (e.g., `[a-z0-9]`, `[A-Z0-9]`, `[0-9a-f]`) a false-positive candidate.

## Prevention

When writing Zod schemas or any TypeScript that includes inline regex literals with digit character-class ranges, apply these rules before running the gate:

1. **Prefer omitting `.regex()`** when length validation and DB/FK constraints are sufficient — removes the false-positive surface entirely.
2. **Extract to an `ALL_CAPS` constant** on its own line when format validation is needed — the checker skips constant-definition lines, so the regex literal never reaches the extractor at usage sites.
3. **Test files are fully exempt** — the checker skips `*.test.ts` / `*.spec.ts`, so format-validation patterns can live safely in test fixtures without triggering the gate.

Do not use `--init` to reset the ratchet for a false positive unless you have verified the file contains no real magic numbers.

## Related Issues

- `docs/solutions/architecture-patterns/lorenzo-vision-pipeline-canonical-ingestion-2026-05-07.md` — adjacent case: the `{6}` in `/pattern{6}/` is extracted the same way (regex literal not stripped; digit preceded by `{`, which also isn't in the lookbehind exclusion set). That doc's workaround (`new RegExp("string")`) also fixes the character-class variant.
- `docs/solutions/tooling/magic-numbers-ratchet-improvements.md` — general false-positive classes for the ratchet; does not yet cover the regex character-class digit case.
