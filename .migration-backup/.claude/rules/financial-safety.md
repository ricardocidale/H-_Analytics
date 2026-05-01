# Financial Code Safety Rules

These rules apply to all code in `client/src/lib/financial/` and `calc/`.

## Mandatory

1. **No `Math.pow`** — Use `dPow` from `calc/shared/decimal.ts`. Decimal-safe exponentiation prevents floating-point drift in compounding.

2. **No `safeNum`** — Use `assertFinite(value, label)`. Silent NaN→0 coercion hides data corruption. `assertFinite` throws with context.

3. **No `Number.isFinite(x) ? x : 0`** — This is silent coercion. Use `assertFinite(x, label)` or handle the invalid case explicitly.

4. **No `isNaN(x) ? 0 : x`** — Same as above. Never silently replace invalid with zero in financial code.

5. **Guard all division** — When the denominator could be zero (rates, per-unit metrics, ratios), either:
   - Use `dDiv` (returns 0 only when numerator is also 0), or
   - Check denominator explicitly before dividing, or
   - Use `assertFinite` on the result

6. **Use `dSum` for accumulations** — Running `+=` loops on financial totals must use `dSum(parts)` to avoid floating-point drift. Collect parts in an array, sum once.

7. **No `|| 0` on computed financial values** — Use `?? 0` only for optional config defaults (room count, days, etc.), never for computed financial results that should fail-fast if invalid.

## Verification

Run `npx tsx script/audit-deep.ts` to check compliance. Zero critical/high issues required.
