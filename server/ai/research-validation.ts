import type { MarketIntelligence } from "../../shared/market-intelligence";
import type { AnalystPanel, MetricComparison, ApiValidationResult } from "./research-orchestrator";

function extractMid(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj?.[key] as Record<string, unknown> | number | undefined;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null) {
    if (typeof (v as Record<string, unknown>).mid === "number") return (v as Record<string, unknown>).mid as number;
    if (typeof (v as Record<string, unknown>).value === "number") return (v as Record<string, unknown>).value as number;
    if (typeof (v as Record<string, unknown>).recommendedRate === "string") {
      const m = ((v as Record<string, unknown>).recommendedRate as string).match(/([\d.]+)/);
      if (m) { const n = parseFloat(m[1]); return n > 1 ? n / 100 : n; }
    }
    if (typeof (v as Record<string, unknown>).recommendedRange === "string") {
      const nums = ((v as Record<string, unknown>).recommendedRange as string).replace(/[^0-9.,\-–]/g, " ").split(/[\s–\-]+/).map((x: string) => parseFloat(x.replace(/,/g, ""))).filter((n: number) => !isNaN(n));
      if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
      if (nums.length === 1) return nums[0];
    }
  }
  return undefined;
}

function parseStringRate(s: string): number | undefined {
  const bps = s.match(/([\d.]+)\s*(?:bps|basis\s*points?)/i);
  if (bps) return parseFloat(bps[1]) / 10000;
  const pct = s.match(/([\d.]+)\s*%/);
  if (pct) {
    const v = parseFloat(pct[1]);
    return v > 1 ? v / 100 : v;
  }
  const rangeMatch = s.match(/([\d.]+)\s*[-–]\s*([\d.]+)\s*%/);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    const mid = (low + high) / 2;
    return mid > 1 ? mid / 100 : mid;
  }
  const dollarMatch = s.match(/\$\s*([\d,.]+)/);
  if (dollarMatch) return parseFloat(dollarMatch[1].replace(/,/g, ""));
  const plain = parseFloat(s);
  return isNaN(plain) ? undefined : plain;
}

function extractDeep(obj: Record<string, unknown>, dotPath: string): number | undefined {
  let cur: unknown = obj;
  for (const part of dotPath.split(".")) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  if (typeof cur === "number") return cur;
  if (typeof cur === "string") return parseStringRate(cur);
  if (cur && typeof cur === "object") return extractMid(cur as Record<string, unknown>, "mid") ?? extractMid(cur as Record<string, unknown>, "value");
  return undefined;
}

function divergencePct(a: number, b: number): number {
  const avg = (Math.abs(a) + Math.abs(b)) / 2;
  if (avg < 1e-6) return 0;
  return Math.abs(a - b) / avg;
}

function compareMetric(
  name: string,
  aVal?: number,
  bVal?: number,
  apiVal?: number,
  apiSource?: string,
): MetricComparison {
  const hasA = aVal !== undefined;
  const hasB = bVal !== undefined;
  const hasBoth = hasA && hasB;
  const divPct  = hasBoth ? divergencePct(aVal!, bVal!) : undefined;
  const agree   = hasBoth && divPct !== undefined && divPct < 0.15;

  let status: MetricComparison["status"] = hasBoth
    ? (agree ? "agree" : "diverge")
    : (hasA || hasB) ? "agree" : "agree";

  const singleSided = (hasA || hasB) && !hasBoth;

  if (apiVal !== undefined) {
    const ref = hasBoth ? (aVal! + bVal!) / 2 : hasA ? aVal! : hasB ? bVal! : undefined;
    if (ref !== undefined) {
      const vsRef = divergencePct(ref, apiVal);
      if (vsRef < 0.10) status = "api-confirms";
      else if (vsRef > 0.25) status = "api-contradicts";
    }
  }

  return { metric: name, analystA: aVal, analystB: bVal, apiValue: apiVal, apiSource, status, divergencePct: divPct, singleSided };
}

export function buildApiValidation(
  panelA: AnalystPanel,
  panelB: AnalystPanel,
  mi?: MarketIntelligence,
): ApiValidationResult {
  const comparisons: MetricComparison[] = [];
  const a = panelA.output;
  const b = panelB.output;

  comparisons.push(compareMetric(
    "adr",
    extractMid(a, "adr") ?? extractDeep(a, "adrAnalysis.mid"),
    extractMid(b, "adr") ?? extractDeep(b, "adrAnalysis.mid"),
    mi?.xotelo?.adrBenchmark?.value ?? mi?.benchmarks?.adr?.value ?? mi?.costar?.adr?.value,
    mi?.xotelo ? "Xotelo OTA" : mi?.costar ? "CoStar" : mi?.benchmarks ? "CoStar/STR" : undefined,
  ));

  comparisons.push(compareMetric(
    "occupancy",
    extractMid(a, "occupancy") ?? extractDeep(a, "occupancyAnalysis.mid"),
    extractMid(b, "occupancy") ?? extractDeep(b, "occupancyAnalysis.mid"),
    mi?.benchmarks?.occupancy?.value ?? mi?.costar?.occupancyRate?.value,
    mi?.costar ? "CoStar" : mi?.benchmarks ? "CoStar/STR" : undefined,
  ));

  comparisons.push(compareMetric(
    "capRate",
    extractMid(a, "capRate") ?? extractDeep(a, "capRateAnalysis.mid"),
    extractMid(b, "capRate") ?? extractDeep(b, "capRateAnalysis.mid"),
    mi?.benchmarks?.capRate?.value ?? mi?.costar?.submarketCapRate?.value,
    mi?.costar ? "CoStar" : mi?.benchmarks ? "STR/CoStar" : undefined,
  ));

  comparisons.push(compareMetric(
    "revpar",
    extractMid(a, "revpar") ?? extractDeep(a, "revparAnalysis.mid"),
    extractMid(b, "revpar") ?? extractDeep(b, "revparAnalysis.mid"),
    mi?.benchmarks?.revpar?.value ?? mi?.costar?.revpar?.value,
    mi?.costar ? "CoStar" : mi?.benchmarks ? "CoStar/STR" : undefined,
  ));

  comparisons.push(compareMetric(
    "adrGrowth",
    extractDeep(a, "adrAnalysis.recommendedGrowthRate") ?? extractDeep(a, "adrAnalysis.annualGrowthRate"),
    extractDeep(b, "adrAnalysis.recommendedGrowthRate") ?? extractDeep(b, "adrAnalysis.annualGrowthRate"),
    mi?.costar?.rentGrowthYoY?.value ? mi.costar.rentGrowthYoY.value / 100 : undefined,
    mi?.costar?.rentGrowthYoY ? "CoStar YoY" : undefined,
  ));

  const fredInflation = mi?.rates?.cpi?.current?.value;
  comparisons.push(compareMetric(
    "inflationRate",
    extractDeep(a, "localEconomics.inflationRate") ?? extractMid(a, "inflationRate"),
    extractDeep(b, "localEconomics.inflationRate") ?? extractMid(b, "inflationRate"),
    fredInflation ? fredInflation / 100 : undefined,
    fredInflation ? "FRED CPI" : undefined,
  ));

  const fredSofr = mi?.rates?.sofr?.current?.value;
  comparisons.push(compareMetric(
    "interestRate",
    extractDeep(a, "localEconomics.interestRate") ?? extractMid(a, "interestRate"),
    extractDeep(b, "localEconomics.interestRate") ?? extractMid(b, "interestRate"),
    fredSofr ? fredSofr / 100 : undefined,
    fredSofr ? "FRED SOFR" : undefined,
  ));

  comparisons.push(compareMetric(
    "costRooms",
    extractDeep(a, "operatingCostAnalysis.roomRevenueBased.housekeeping.mid"),
    extractDeep(b, "operatingCostAnalysis.roomRevenueBased.housekeeping.mid"),
  ));

  comparisons.push(compareMetric(
    "costFB",
    extractDeep(a, "operatingCostAnalysis.roomRevenueBased.fbCostOfSales.mid"),
    extractDeep(b, "operatingCostAnalysis.roomRevenueBased.fbCostOfSales.mid"),
  ));

  comparisons.push(compareMetric(
    "costAdmin",
    extractDeep(a, "operatingCostAnalysis.totalRevenueBased.adminGeneral.mid"),
    extractDeep(b, "operatingCostAnalysis.totalRevenueBased.adminGeneral.mid"),
  ));

  comparisons.push(compareMetric(
    "costFFE",
    extractDeep(a, "operatingCostAnalysis.totalRevenueBased.ffeReserve.mid"),
    extractDeep(b, "operatingCostAnalysis.totalRevenueBased.ffeReserve.mid"),
  ));

  comparisons.push(compareMetric(
    "baseMgmtFee",
    extractDeep(a, "managementServiceFeeAnalysis.baseFee.mid") ?? extractDeep(a, "baseMgmtFee"),
    extractDeep(b, "managementServiceFeeAnalysis.baseFee.mid") ?? extractDeep(b, "baseMgmtFee"),
  ));

  const withValues = comparisons.filter(c => c.analystA !== undefined || c.analystB !== undefined);
  const dualSided = withValues.filter(c => !c.singleSided);
  const agreed = dualSided.filter(c => c.status === "agree" || c.status === "api-confirms").length;
  const consensusRatio = dualSided.length > 0 ? agreed / dualSided.length : 0;

  return { comparisons: withValues, consensusRatio };
}
