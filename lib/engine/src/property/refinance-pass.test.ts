import { describe, it, expect } from 'vitest';
import { applyRefiLtvOriginalCap } from './refinance-pass';
import { DEFAULT_REFI_MAX_LTV_TO_ORIGINAL } from '@shared/constants-funding';

/**
 * Plan 2026-05-13-001 U2 — refi-LTV cap against the ORIGINAL acquisition
 * loan amount. The cap is implemented as a pre-step before
 * `computeRefinance`: we lower the LTV input so the resulting new-loan is
 * bounded by `originalLoan × refiMaxLtvToOriginal`.
 *
 * Test scenarios mirror plan U2:
 *   (a) Cap does NOT bind — refi target < cap → behavior unchanged.
 *   (b) Cap binds at 70% default — typical mid-projection NOI spike.
 *   (c) Custom 50% cap binds tighter than the 70% default.
 *   (d) Default (0.70) applied when caller omits the field.
 *   (e) Degenerate inputs (zero valuation, zero original loan) — cap inert.
 */

describe('applyRefiLtvOriginalCap', () => {
  // Shared scenario: original loan $3.75M (typical L+B financed acquisition
  // at 75% LTV on $5M purchase price). refiLtv = 0.70.
  const originalLoanAmount = 3_750_000;
  const refiLtv = 0.70;

  it('(a) cap does NOT bind when refi target < original × cap', () => {
    // propertyValueAtRefi modest: $5.4M. At 70% LTV → new loan = $3.78M.
    // Cap: 3.75M × 0.70 = $2.625M. Wait — that *would* bind. Pick a smaller
    // valuation so the cap exceeds the LTV target:
    // propertyValueAtRefi = $3M; 70% LTV → $2.1M. Cap = 3.75M × 0.70 = $2.625M.
    // 2.1M < 2.625M → cap does NOT bind.
    const result = applyRefiLtvOriginalCap({
      refiLtv,
      refiMaxLtvToOriginal: DEFAULT_REFI_MAX_LTV_TO_ORIGINAL,
      originalLoanAmount,
      propertyValueAtRefi: 3_000_000,
    });

    expect(result.capBinds).toBe(false);
    expect(result.effectiveLtv).toBe(refiLtv);
    // impliedLtvCap is still computed and returned (caller may surface for diagnostics).
    expect(result.impliedLtvCap).not.toBeNull();
    expect(result.impliedLtvCap).toBeCloseTo(0.875, 3); // 2.625M / 3M
  });

  it('(b) cap binds at 70% default — mid-projection NOI spike', () => {
    // propertyValueAtRefi = $11M (Year-7 NOI/exit-cap surge).
    // 70% LTV → new loan = $7.7M. Cap = 3.75M × 0.70 = $2.625M.
    // 7.7M > 2.625M → cap BINDS; impliedLtv = 2.625M / 11M ≈ 0.2386.
    const result = applyRefiLtvOriginalCap({
      refiLtv,
      refiMaxLtvToOriginal: DEFAULT_REFI_MAX_LTV_TO_ORIGINAL,
      originalLoanAmount,
      propertyValueAtRefi: 11_000_000,
    });

    expect(result.capBinds).toBe(true);
    // 3.75M × 0.70 / 11M = 0.238636…
    expect(result.effectiveLtv).toBeCloseTo(0.2386, 3);
    expect(result.effectiveLtv).toBeLessThan(refiLtv);
    expect(result.impliedLtvCap).toBeCloseTo(0.2386, 3);

    // Sanity: the resulting new-loan equals the intended cap.
    const newLoan = 11_000_000 * result.effectiveLtv;
    expect(newLoan).toBeCloseTo(originalLoanAmount * DEFAULT_REFI_MAX_LTV_TO_ORIGINAL, 1);
  });

  it('(c) custom 50% cap binds tighter than the 70% default', () => {
    // Same valuation as (b) but cap = 0.50.
    // Cap value: 3.75M × 0.50 = $1.875M. impliedLtv = 1.875M / 11M ≈ 0.1705.
    // 0.1705 < 0.2386 (the default-cap impliedLtv from (b)) — tighter.
    const result = applyRefiLtvOriginalCap({
      refiLtv,
      refiMaxLtvToOriginal: 0.50,
      originalLoanAmount,
      propertyValueAtRefi: 11_000_000,
    });

    expect(result.capBinds).toBe(true);
    expect(result.effectiveLtv).toBeCloseTo(0.1705, 3);

    // Tighter than the 70% scenario:
    const newLoanCustom = 11_000_000 * result.effectiveLtv;
    expect(newLoanCustom).toBeLessThan(originalLoanAmount * DEFAULT_REFI_MAX_LTV_TO_ORIGINAL);
    expect(newLoanCustom).toBeCloseTo(originalLoanAmount * 0.50, 1);
  });

  it('(d) DEFAULT_REFI_MAX_LTV_TO_ORIGINAL value matches the seed-time canonical 0.70', () => {
    // Plan U2 spec: "Default 70%". This guards against an accidental constant
    // edit that would silently widen the cap on every property at boot.
    expect(DEFAULT_REFI_MAX_LTV_TO_ORIGINAL).toBe(0.70);
  });

  it('(e) zero propertyValueAtRefi — cap is inert (caller handles fallback)', () => {
    const result = applyRefiLtvOriginalCap({
      refiLtv,
      refiMaxLtvToOriginal: DEFAULT_REFI_MAX_LTV_TO_ORIGINAL,
      originalLoanAmount,
      propertyValueAtRefi: 0,
    });

    expect(result.capBinds).toBe(false);
    expect(result.effectiveLtv).toBe(refiLtv);
    expect(result.impliedLtvCap).toBeNull();
  });

  it('(e2) zero originalLoanAmount (cash purchase) — cap is inert', () => {
    const result = applyRefiLtvOriginalCap({
      refiLtv,
      refiMaxLtvToOriginal: DEFAULT_REFI_MAX_LTV_TO_ORIGINAL,
      originalLoanAmount: 0,
      propertyValueAtRefi: 11_000_000,
    });

    expect(result.capBinds).toBe(false);
    expect(result.effectiveLtv).toBe(refiLtv);
    expect(result.impliedLtvCap).toBeNull();
  });

  it('boundary: impliedLtvCap exactly equals refiLtv → cap does NOT bind (strict <)', () => {
    // Construct a scenario where impliedLtvCap === refiLtv exactly.
    // originalLoan × cap / propertyValueAtRefi === refiLtv
    // 3.75M × 0.70 / pv = 0.70  →  pv = 3.75M.
    const result = applyRefiLtvOriginalCap({
      refiLtv,
      refiMaxLtvToOriginal: DEFAULT_REFI_MAX_LTV_TO_ORIGINAL,
      originalLoanAmount,
      propertyValueAtRefi: 3_750_000,
    });

    // impliedLtvCap === refiLtv = 0.70 → not strictly less → does NOT bind.
    expect(result.capBinds).toBe(false);
    expect(result.effectiveLtv).toBe(refiLtv);
    expect(result.impliedLtvCap).toBeCloseTo(0.70, 6);
  });
});
