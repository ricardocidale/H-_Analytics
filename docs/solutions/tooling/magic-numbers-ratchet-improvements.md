---
title: "Magic-Numbers Ratchet: Test Exclusion and Content-Hash Deduplication"
date: 2026-05-01
last_updated: 2026-05-08
category: tooling
module: scripts/check-magic-numbers
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - "The magic-numbers ratchet reports new regressions after adding test files"
  - "The ratchet inflates suspect counts due to lib/shared ↔ api-server/shared mirror"
  - "Regulatory citation strings (IRS Pub 946, NOM-030) appear as magic numbers"
  - "Industry-spec dimensional values (PDF page sizes, HD/4K resolutions, DPI, RGBA channels) trip the gate"
  - "Tempted to wrap a literal in a route-local ALL_CAPS const to satisfy the gate (the masking-literal anti-pattern)"
  - "Choosing a home for a new DEFAULT_* or operational constant"
tags: [magic-numbers, ratchet, testing, shared-constants, deduplication, industry-standards, masking-anti-pattern, business-assumptions]
related_components: [scripts/src/check-magic-numbers.ts, scripts/src/_magic-numbers-baseline.json, .agents/skills/no-magic-numbers/SKILL.md]
---

# Magic-Numbers Ratchet: Test Exclusion and Content-Hash Deduplication

## Problem

Four classes of false positives caused the ratchet at `scripts/src/check-magic-numbers.ts` to flag legitimate code as regressions:

1. **Test fixture values** — `.test.ts` files contain literal values that are inputs under test (e.g., `score: 0.75`, `weight: 80`). These are assertions, not production magic numbers.
2. **Mirror inflation** — `lib/shared/src/` is mirrored verbatim to `artifacts/api-server/src/shared/`. Every constant defined once was counted in 2 files, pushing many legitimate constants over the 4-file threshold.
3. **Regulatory citation fragments** — strings like `"IRS Publication 946"` or `"NOM-030-SSA3-2013"` contain digit sequences the scanner extracts as bare numerals.
4. **Industry-standard dimensional/encoding constants** *(2026-05-08)* — PDF page sizes (`595 × 842` for A4 per ISO 216, `612 × 792` for US Letter), HD/4K resolutions (`1920 × 1080`, `1280 × 720`, `3840 × 2160` per ITU-R BT.709/2020), canonical slide canvas (`960 × 540`), DPI conventions (`72` PDF / `96` CSS), unit conversions (`25.4` mm/inch, `2.54` cm/inch — NIST exact), and 8-bit color depth (`256`/`255`). These are spec-fixed by external standards bodies and don't carry the cross-jurisdictional drift risk the gate exists to catch.

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

### 4. Industry-standard dimensional/encoding allowlist *(2026-05-08)*
Added 18 spec-fixed values to `ALLOWED_DUPLICATED_VALUES`. Each entry cites the standards body so reviewers can verify the value is genuinely externally fixed, not a brand or design choice masquerading as one:
```ts
// HD/4K resolutions (ITU-R BT.709 / BT.2020)
"1920", "1080", "1280", "720", "3840", "2160",
// Canonical slide canvas (1920/2 × 1080/2 — half-resolution authoring frame)
"960", "540",
// Paper sizes in PDF points (ISO 216 / ANSI)
"595", "842",   // A4
"612", "792",   // US Letter
// Paper sizes in mm
"210", "297",   // A4
// DPI / unit definitions
"72",   // PDF points per inch (ISO 32000)
"96",   // CSS px per inch (W3C CSS spec)
"25.4", // mm per inch (NIST exact)
"2.54", // cm per inch (NIST exact)
// 8-bit color depth
"256", "255",
```

## Scope clarification: what the gate is — and isn't — for *(2026-05-08)*

The gate exists to catch **business-model assumptions, financial calculations, and source-of-information thresholds** — values that drift, get re-tuned, or vary by jurisdiction. The user's framing: *"my main concern with magic numbers have to do with assumptions related to the business model and calculations and sources of information that feed the app main purpose. design and computer science constants that are industry standard are not the concern."*

| In scope (gate enforces) | Out of scope (allowlist suffices) |
|---|---|
| Tax rates, depreciation lives, occupancy, cap rates, inflation, ADR growth | Industry-standard dimensions: `1920×1080`, `595×842`, `612×792`, `960×540` |
| Discount rates, interest rates, terminal growth, risk premia | Industry-standard ratios: 16:9, 4:3, golden ratio |
| Specialist research thresholds, comp-set selection cutoffs, conviction floors | DPI/unit definitions: 72 pt/inch, 96 px/inch, 25.4 mm/inch, 2.54 cm/inch |
| Anything that varies by country, market, or time | CS constants: 4 RGBA channels, 256/255 8-bit color depth |
| | Design tokens: 8/16/24-px spacing scales |
| | HTTP/network: 200, 404, 500, port numbers |

**Unifying test:** if changing the literal means you no longer have the named output (`1920×1080` IS Full HD by definition; if you change it you don't have HD), it's industry-standard — out of scope. If changing it means a different business outcome (`0.03` inflation could be `0.05` in another country), it's in scope.

### The masking-literal anti-pattern (still forbidden, even when named)

`ALL_CAPS = <number>` may only live in one of three canonical constants files:

- `lib/shared/src/constants*.ts` — cross-package shared
- `lib/db/src/constants.ts` — schema-coupled
- `artifacts/api-server/src/constants.ts` — server-only operational (rate limits, retry budgets, circuit-breaker windows)

Defining `const LB_DECK_RATE_LIMIT_MAX_REQ = 60` in a route file is the same violation as `60` itself — the name hides cross-file drift but doesn't prevent it. The gate's regex catches raw literals; the convention catches named-but-misplaced literals. CLAUDE.md §2 is the authority.

**Concrete example (caught during the U10 producer PR):**
```ts
// BEFORE — in artifacts/api-server/src/routes/internal-lb-deck-payload.ts
const LB_DECK_RATE_LIMIT_MAX_REQ = 60;
const LB_DECK_RATE_LIMIT_WINDOW_MS = 60 * 1_000;
const limiter = aiRateLimit(LB_DECK_RATE_LIMIT_MAX_REQ, LB_DECK_RATE_LIMIT_WINDOW_MS);

// AFTER — definitions in artifacts/api-server/src/constants.ts
export const LB_DECK_PAYLOAD_RATE_LIMIT_MAX_REQ = 60;
export const LB_DECK_PAYLOAD_RATE_LIMIT_WINDOW_MS = 60_000;
// route imports from "../constants"
```

### In-scope contrast (named form still wrong)
```ts
// VIOLATION — even though named, inflation varies by jurisdiction.
const DEFAULT_INFLATION_RATE = 0.03;

// CORRECT — route layer fetches from authority table; calc receives it.
const inflation = await getFactoryNumber('inflationRate', property.country);
computeProjections({ inflationRate: inflation });
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
- Industry-spec dimensional/encoding values belong in `ALLOWED_DUPLICATED_VALUES` with a citation of the standards body (PDF spec, ISO 216, ITU-R BT.709/2020, W3C CSS, NIST). If a value is a brand/design choice (e.g., "we picked 1920×1080 because L+B uses HD"), the *adoption* is a Cat-2 DEFAULT decision, but the literal `1920` itself is still spec-fixed and goes on the allowlist.
- Reviewing a `const ALL_CAPS = <number>` definition? Verify the file is one of the three canonical constants files. Anywhere else, the named form is the masking anti-pattern — promote to the canonical file or route through `getFactoryNumber(key, country)` for jurisdiction-varying values.

## Related Issues
- `.agents/skills/no-magic-numbers/SKILL.md` — the discipline doc, kept in sync with this learning's scope clarification (in-scope vs. out-of-scope literal classes, masking anti-pattern, three canonical constants files)
- `docs/solutions/tooling/mirror-shared-package-sync.md` — sync invariant that the content-hash deduplication relies on
- `CLAUDE.md` §2 — the four-category number taxonomy that the masking-literal rule enforces
