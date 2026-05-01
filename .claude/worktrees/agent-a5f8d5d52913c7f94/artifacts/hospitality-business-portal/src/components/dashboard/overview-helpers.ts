import { PropertyStatus } from "@shared/constants";
import { computeIRR } from "@analytics/returns/irr.js";

export const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export const STATUS_COLORS: Record<string, string> = {
  [PropertyStatus.OPERATING]: "bg-primary",
  [PropertyStatus.IMPROVEMENTS]: "bg-accent-pop",
  [PropertyStatus.ACQUIRED]: "bg-chart-1",
  [PropertyStatus.IN_NEGOTIATION]: "bg-chart-3",
  [PropertyStatus.PLANNED]: "bg-chart-1",
  [PropertyStatus.PIPELINE]: "bg-muted-foreground",
};

export const STATUSES = [PropertyStatus.OPERATING, PropertyStatus.IMPROVEMENTS, PropertyStatus.ACQUIRED, PropertyStatus.IN_NEGOTIATION, PropertyStatus.PLANNED, PropertyStatus.PIPELINE] as const;

export const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export interface WaterfallItem {
  name: string;
  value: number;
  base: number;
  fill: string;
  isSubtotal: boolean;
}

export function buildWaterfallData(yearData: {
  revenueTotal: number;
  gop: number;
  agop: number;
  noi: number;
  anoi: number;
  feeBase: number;
  feeIncentive: number;
  expenseFFE: number;
  expenseTaxes: number;
}): WaterfallItem[] {
  const deptExpenses = yearData.revenueTotal - yearData.gop;
  const fees = yearData.feeBase + yearData.feeIncentive;
  const fixedCharges = yearData.expenseTaxes;
  const ffe = yearData.expenseFFE;

  const items: WaterfallItem[] = [];
  let running = yearData.revenueTotal;

  items.push({ name: "Total Revenue", value: running, base: 0, fill: "hsl(var(--chart-1))", isSubtotal: true });
  items.push({ name: "Operating Exp.", value: deptExpenses, base: running - deptExpenses, fill: "hsl(var(--chart-2))", isSubtotal: false });
  running -= deptExpenses;
  items.push({ name: "GOP", value: running, base: 0, fill: "hsl(var(--chart-1))", isSubtotal: true });
  items.push({ name: "Mgmt Fees", value: fees, base: running - fees, fill: "hsl(var(--chart-4))", isSubtotal: false });
  running -= fees;
  items.push({ name: "AGOP", value: yearData.agop, base: 0, fill: "hsl(var(--chart-1))", isSubtotal: true });
  running = yearData.agop;
  items.push({ name: "Fixed Charges", value: fixedCharges, base: running - fixedCharges, fill: "hsl(var(--chart-5))", isSubtotal: false });
  running -= fixedCharges;
  items.push({ name: "NOI", value: yearData.noi, base: 0, fill: "hsl(var(--chart-1))", isSubtotal: true });
  running = yearData.noi;
  items.push({ name: "FF&E Reserve", value: ffe, base: running - ffe, fill: "hsl(var(--chart-2))", isSubtotal: false });
  running -= ffe;
  items.push({ name: "ANOI", value: running, base: 0, fill: "hsl(var(--primary))", isSubtotal: true });

  return items;
}

export function calculateIRR(cashFlows: number[]): number {
  const result = computeIRR(cashFlows, 1);
  return result.irr_periodic ?? 0;
}

export type ChartMode = "area" | "line";

export const truncName = (name: string) => {
  const limit = typeof window !== "undefined" && window.innerWidth < 640 ? 10 : 15;
  return name.length > limit ? name.substring(0, limit - 2) + '\u2026' : name;
};
