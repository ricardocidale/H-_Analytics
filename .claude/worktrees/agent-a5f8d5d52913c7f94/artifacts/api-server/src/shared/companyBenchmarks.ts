export interface BenchmarkSeedRange {
  low: number;
  mid: number;
  high: number;
  source: string;
}

export const COMPANY_SEED_RANGES: Record<string, BenchmarkSeedRange> = {
  incentiveFee: { low: 8, mid: 10, high: 12, source: "HVS Mgmt Agreement Study" },
  svcFeeMarketing: { low: 0.5, mid: 1.0, high: 1.5, source: "HVS Mgmt Agreement Study" },
  svcFeeTechReservations: { low: 1.5, mid: 2.0, high: 3.0, source: "HVS Mgmt Agreement Study" },
  svcFeeAccounting: { low: 0.5, mid: 1.0, high: 1.5, source: "HVS Mgmt Agreement Study" },
  svcFeeRevenueMgmt: { low: 0.5, mid: 1.0, high: 1.5, source: "HVS Mgmt Agreement Study" },
  svcFeeGeneralMgmt: { low: 0.7, mid: 1.0, high: 1.2, source: "HVS Mgmt Agreement Study" },
};

const SVC_FEE_KEYS = ["svcFeeMarketing", "svcFeeTechReservations", "svcFeeAccounting", "svcFeeRevenueMgmt", "svcFeeGeneralMgmt"] as const;

export const TOTAL_BASE_FEE_RANGE: BenchmarkSeedRange = {
  low: SVC_FEE_KEYS.reduce((sum, k) => sum + COMPANY_SEED_RANGES[k].low, 0),
  mid: SVC_FEE_KEYS.reduce((sum, k) => sum + COMPANY_SEED_RANGES[k].mid, 0),
  high: SVC_FEE_KEYS.reduce((sum, k) => sum + COMPANY_SEED_RANGES[k].high, 0),
  source: "HVS Mgmt Agreement Study",
};

export const NET_MARGIN_RANGE: BenchmarkSeedRange = {
  low: 8,
  mid: 16,
  high: 25,
  source: "HVS Mgmt Agreement Study",
};

export const GA_OVERHEAD_RANGE: BenchmarkSeedRange = {
  low: 55,
  mid: 70,
  high: 85,
  source: "USALI undistributed",
};

export const STAFF_COST_RANGE: BenchmarkSeedRange = {
  low: 20,
  mid: 32,
  high: 45,
  source: "USALI undistributed",
};
