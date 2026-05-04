import { describe, it, expect } from 'vitest';
import { dSum, dMul, dDiv, dRound, dPow, assertFinite } from '@calc/shared/decimal';

describe('Decimal Precision (T005)', () => {
  it('dDiv(x, 0) returns 0 (not Infinity)', () => {
    expect(dDiv(10, 0)).toBe(0);
  });

  it('dDiv(0, x) returns 0', () => {
    expect(dDiv(0, 5)).toBe(0);
  });

  it('dDiv(NaN, x) returns 0', () => {
    expect(dDiv(NaN, 5)).toBe(0);
  });

  it('dDiv(NaN, 0) returns 0', () => {
    expect(dDiv(NaN, 0)).toBe(0);
  });

  it('dDiv(Infinity, 1) returns 0', () => {
    expect(dDiv(Infinity, 1)).toBe(0);
  });

  it('dSum([0.1, 0.2]) equals 0.3 exactly (no floating-point drift)', () => {
    expect(dSum([0.1, 0.2])).toBe(0.3);
  });

  it('dSum([]) returns 0', () => {
    expect(dSum([])).toBe(0);
  });

  it('dRound(1.005, 2) returns 1.01 (ROUND_HALF_UP)', () => {
    expect(dRound(1.005, 2)).toBe(1.01);
  });

  it('dRound(1.004, 2) returns 1.00', () => {
    expect(dRound(1.004, 2)).toBe(1.00);
  });

  it('dPow(2, 10) returns 1024 exactly', () => {
    expect(dPow(2, 10)).toBe(1024);
  });

  it('assertFinite(42, "test") returns 42', () => {
    expect(assertFinite(42, 'test')).toBe(42);
  });

  it('assertFinite(NaN, "x") throws', () => {
    expect(() => assertFinite(NaN, 'x')).toThrow();
  });

  it('assertFinite(Infinity, "x") throws', () => {
    expect(() => assertFinite(Infinity, 'x')).toThrow();
  });

  it('dMul(0.1, 0.2) equals 0.02 (no floating-point error)', () => {
    expect(dMul(0.1, 0.2)).toBe(0.02);
  });

  it('dDiv(1, 3) produces a finite result with high precision', () => {
    const result = dDiv(1, 3);
    expect(result).toBeGreaterThan(0.3333333333);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('Large number: dSum([1e15, 1e15]) equals 2e15', () => {
    expect(dSum([1e15, 1e15])).toBe(2e15);
  });

  it('Chained precision: dSum([dMul(0.1, 3), dMul(0.2, 3)]) is close to 0.9', () => {
    // 0.1 * 3 = 0.3
    // 0.2 * 3 = 0.6
    // 0.3 + 0.6 = 0.9
    expect(dSum([dMul(0.1, 3), dMul(0.2, 3)])).toBe(0.9);
  });
});
