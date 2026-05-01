export interface RoundingPolicy {
  precision: number;
  bankers_rounding: boolean;
}

export function roundTo(value: number, policy: RoundingPolicy): number {
  const factor = Math.pow(10, policy.precision);
  if (policy.bankers_rounding) {
    const shifted = value * factor;
    const floored = Math.floor(shifted);
    const decimal = shifted - floored;
    if (Math.abs(decimal - 0.5) < 1e-10) {
      return (floored % 2 === 0 ? floored : floored + 1) / factor;
    }
    return Math.round(shifted) / factor;
  }
  return Math.round(value * factor) / factor;
}
