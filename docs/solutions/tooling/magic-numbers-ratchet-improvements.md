---
title: "Magic-Numbers Ratchet: Test Exclusion and Content-Hash Deduplication"
date: 2026-05-01
category: tooling
module: scripts/check-magic-numbers
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - "The magic-numbers ratchet reports new regressions after adding test files"
  - "The ratchet inflates suspect counts due to lib/shared ↔ api-server/shared mirror"
  - "Regulatory citation strings (IRS Pub 946, NOM-030) appear as magic numbers"
tags: [magic-numbers, ratchet, testing, shared-constants, deduplication]
related_components: [scripts/src/check-magic-numbers.ts, scripts/src/_magic-numbers-baseline.json]
---

# Magic-Numbers Ratchet: Test Exclusion and Content-Hash Deduplication

## Problem

Three classes of false positives caused the ratchet at `scripts/src/check-magic-numbers.ts` to flag legitimate code as regressions:

1. **Test fixture values** — `.test.ts` files contain literal values that are inputs under test (e.g., `score: 0.75`, `weight: 80`). These are assertions, not production magic numbers.
2. **Mirror inflation** — `lib/shared/src/` is mirrored verbatim to `artifacts/api-server/src/shared/`. Every constant defined once was counted in 2 files, pushing many legitimate constants over the 4-file threshold.
3. **Regulatory citation fragments** — strings like `"IRS Publication 946"` or `"NOM-030-SSA3-2013"` contain digit sequences the scanner extracts as bare numerals.

## Solution

### 1. Exclude test files entirely
Added `SKIP_FILE_SUFFIXES` set to `walkDir`:
```ts
const SKIP_FILE_SUFFIXES = new Set([".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"]);
// In walkDir:
!Array.from(SKIP_FILE_SUFFIXES).some(s => entry.name.endsWith(s))
```
Test fixtures are not production magic numbers; false positives here create noise that erodes trust in the gate.

### 2. Content-hash deduplication for mirror files
Added `canonicalPath()` in `buildDuplicationMap()`:
```ts
import crypto from "node:crypto";

const contentHashToCanonical = new Map<string, string>();

function canonicalPath(absFile: string, rel: string): string {
  const content = fs.readFileSync(absFile, "utf8");
  const hash = crypto.createHash("sha1").update(content).digest("hex");
  if (!contentHashToCanonical.has(hash)) {
    contentHashToCanonical.set(hash, rel);
  }
  return contentHashToCanonical.get(hash)!;
}
```
Two files with identical byte content are the same logical unit. The lexicographically first path becomes the canonical representative. This collapsed the `lib/shared/src ↔ artifacts/api-server/src/shared` mirror from 2 counted files to 1, reducing suspects from 208 → 177.

### 3. Regulatory citation allowlist
Added digit sequences that appear in legal/regulatory string literals to `ALLOWED_DUPLICATED_VALUES`:
```ts
"946",   // IRS Publication 946 (depreciation)
"030",   // NOM-030-SSA3-2013 (Mexican fire safety regulation)
"04",    // date substrings: "2026-04-01", migration IDs "-004"
"06",    // date substrings: "2026-06-01"
"1980",  // regulatory year: "Arrêté du 25 juin 1980"
"1988",  // regulatory year: "DM 31/12/1988"
"1989",  // regulatory year: "Decreto 3019 de 1989"
"1996",  // regulatory year: "Texto Ordenado 1996"
```

## Running the Ratchet

| Goal | Command |
|------|---------|
| Default ratchet check (CI gate) | `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` |
| Show all current suspects | `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts --show` |
| Re-snapshot baseline after a cleanup | `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts --init` |
| Fail on ANY duplication (aspirational) | `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts --strict` |

## Why This Works

The scanner is a cross-file duplicate detector, not an in-file linter. Its value is catching when the same production numeric literal drifts across multiple modules. Test fixtures and mirror files are structurally guaranteed duplicates that the detector cannot and should not attempt to fix. Excluding them lets the signal-to-noise ratio stay high so actual regressions (a new production literal appearing in 4+ files) stand out.

## Prevention
- After every large constant-extraction sprint, re-init the baseline to lock in gains: `--init`.
- When adding exports to `lib/shared/src/`, keep `artifacts/api-server/src/shared/` in sync (see `mirror-shared-package-sync.md`) — diverged mirrors reintroduce the counting inflation.
- Numeric literals in regulatory citation strings belong in `ALLOWED_DUPLICATED_VALUES` with a one-line justification noting the authority.

## Related Issues
- `docs/solutions/tooling/mirror-shared-package-sync.md` — sync invariant that the content-hash deduplication relies on
