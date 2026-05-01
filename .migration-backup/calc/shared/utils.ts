/**
 * utils.ts — Shared Numerical Utilities for the Calculation Engine
 *
 * Provides consistent rounding policies, tolerance thresholds, and helper functions
 * used throughout the calc/ directory. Financial calculations require careful control
 * of decimal precision — rounding too early loses accuracy, rounding too late creates
 * penny discrepancies that look like bugs in audit reports.
 *
 * Rounding policies:
 *   - DEFAULT_ROUNDING (2 decimals): For dollar amounts — $1,234.56
 *   - RATIO_ROUNDING (4 decimals): For ratios like occupancy — 0.7350 (73.50%)
 *   - RATE_ROUNDING (6 decimals): For interest rates — 0.065000 (6.5%)
 *
 * Tolerance:
 *   - DEFAULT_TOLERANCE ($0.01): Two values within a penny are considered equal.
 *     This is necessary because floating-point math (e.g., 0.1 + 0.2 = 0.30000000000000004)
 *     means exact equality checks would fail on perfectly correct calculations.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import { dSum } from "./decimal.js";

export const DEFAULT_ROUNDING: RoundingPolicy = { precision: 2, bankers_rounding: false };
export const RATIO_ROUNDING: RoundingPolicy = { precision: 4, bankers_rounding: false };
export const RATE_ROUNDING: RoundingPolicy = { precision: 6, bankers_rounding: false };
export const DEFAULT_TOLERANCE = 0.01;
export const CENTS_TOLERANCE = 0.01;

export function rounder(policy: RoundingPolicy = DEFAULT_ROUNDING) {
  return (v: number) => roundTo(v, policy);
}

export function roundCents(v: number): number {
  return Math.round(v * 100) / 100;
}

export function sumArray(arr: number[]): number {
  return dSum(arr);
}

export function sumField<T>(arr: T[], fn: (item: T) => number): number {
  return dSum(arr.map(fn));
}

export function withinTolerance(a: number, b: number, tol: number = DEFAULT_TOLERANCE): boolean {
  return Math.abs(a - b) <= tol;
}

export function variance(a: number, b: number): number {
  return Math.abs(a - b);
}

export function pctChange(baseline: number, alternative: number): number {
  if (baseline === 0) return 0;
  return roundCents(((alternative - baseline) / baseline) * 100);
}
