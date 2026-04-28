/**
 * service-fee.ts — Compute service fee ranges at market rates.
 *
 * Given a property's total revenue and a service type, outputs
 * the expected fee range based on industry benchmarks for
 * hospitality management company services.
 */

interface ServiceFeeInput {
  propertyRevenue: number;
  serviceType: string;
}

interface ServiceFeeOutput {
  serviceType: string;
  propertyRevenue: number;
  lowRate: number;
  midRate: number;
  highRate: number;
  lowFee: number;
  midFee: number;
  highFee: number;
  notes: string;
}

import { SERVICE_FEE_BENCHMARK_RATES, SERVICE_FEE_FALLBACK_RATE } from "@shared/constants";

const SERVICE_BENCHMARKS = SERVICE_FEE_BENCHMARK_RATES;

const LEGACY_KEY_ALIASES: Record<string, string> = {
  it: "technology_reservations",
  reservations: "technology_reservations",
};

export function computeServiceFee(input: ServiceFeeInput): ServiceFeeOutput {
  const rawKey = input.serviceType.toLowerCase().replace(/[\s/&]+/g, "_");
  const key = LEGACY_KEY_ALIASES[rawKey] ?? rawKey;
  const bench = SERVICE_BENCHMARKS[key] ?? { ...SERVICE_FEE_FALLBACK_RATE, notes: `No specific benchmark for "${input.serviceType}". Using general service range 1-3%.` };

  return {
    serviceType: input.serviceType,
    propertyRevenue: input.propertyRevenue,
    lowRate: bench.low,
    midRate: bench.mid,
    highRate: bench.high,
    lowFee: Math.round(input.propertyRevenue * bench.low),
    midFee: Math.round(input.propertyRevenue * bench.mid),
    highFee: Math.round(input.propertyRevenue * bench.high),
    notes: bench.notes,
  };
}
