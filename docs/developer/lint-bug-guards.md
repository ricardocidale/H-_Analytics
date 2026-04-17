# Lint Bug Guards

ESLint is configured in `eslint.config.mjs` to ban patterns that have caused real
bugs in this codebase. Lint and the audit tests in `tests/audit/` are
complementary: lint catches new violations at edit time, audit tests defend
specific files (e.g. `server/integrations/` `fetch()` calls, route handlers)
with structural checks.

## Active rules

| Rule                          | calc/, engine/ | server/, shared/ | client/ | Why |
|-------------------------------|:--------------:|:----------------:|:-------:|-----|
| `Math.pow`                    | error          | error            | warn    | Use `dPow` from `calc/shared/decimal-helpers.ts` for financial math (decimal precision). Non-financial uses (exponential backoff, tile zoom) need an inline disable. |
| `as any`                      | error          | error            | warn    | Defeats the type system. Use a real type, or `as unknown as X` with a comment when truly opaque. |
| `\|\| 0` numeric fallback     | error          | error            | warn    | Silently turns `NaN`/`undefined` into `0`, hiding bad inputs. Use `?? 0` only after a `Number.isFinite` check, or `assertFinite`. |
| `any` keyword                 | error          | —                | —       | Financial code only. |
| `safeNum` global              | error          | —                | —       | Financial code only — use `assertFinite` instead. |
| `fetch()` with no init object | —              | error            | —       | Bare `fetch(url)` cannot carry an `AbortSignal`. Use `fetchWithTimeout` from `server/lib/fetch-with-timeout.ts`. |
| `parseInt` without radix      | —              | error            | —       | Implicit radix bites on strings starting with `0`/`0x`. Pass `10` explicitly. |

Test files (`*.test.ts`, `*.spec.ts`) are exempt from all of the above.

## Pre-existing offenders

A small allowlist at the top of `eslint.config.mjs` (`PRE_EXISTING_OFFENDERS`)
demotes the server/shared rules to **warnings** in legacy files so CI is not
blocked. New code in those files still surfaces as a warning in the editor —
clean them up incrementally and remove them from the allowlist.

## Running lint

- `npm run lint` — full output (errors + warnings).
- `npm run lint:strict` — what CI runs. Errors only; exits non-zero on any
  error-level violation. Warnings are informational.

CI invokes `lint:strict` in `.github/workflows/ci.yml`, and the local `lint` /
`Project` workflows invoke the same eslint config.

## Approved escape hatch

When a rule legitimately does not apply (e.g. `Math.pow(2, attempt)` for jitter
in retry backoff, or `Math.pow(2, zoom)` for tile math):

```ts
// eslint-disable-next-line no-restricted-syntax -- exponential backoff, not financial math
const delay = baseDelayMs * Math.pow(2, attempt - 1);
```

Always add a `--` comment explaining *why*. Do **not** add file-level
`/* eslint-disable */` blocks; if a whole file needs it, add it to the
`PRE_EXISTING_OFFENDERS` allowlist with a TODO.

## See also

- `tests/audit/no-fetch-without-timeout.test.ts` — structural check that all
  `fetch()` calls in `server/integrations/` carry a `signal:`.
- `tests/audit/no-raw-number-params.test.ts` — bans `Number(req.params.*)` in
  route handlers.
- `tests/audit/vocabulary-compliance.test.ts` — UI copy guard.
