export type KpiSpark = number[];

export type KpiDatum = {
  key: "revenue" | "netIncome" | "expenses" | "properties";
  label: string;
  sublabel: string;
  value: number;
  formatted: string;
  spark: KpiSpark;
  deltaVsY1Pct: number | null;
  positiveDirection: "up" | "down" | "neutral";
};

export const KPIS: KpiDatum[] = [
  {
    key: "revenue",
    label: "Total Revenue",
    sublabel: "Year 5",
    value: 145_320,
    formatted: "$145.3K",
    spark: [32_400, 58_100, 89_400, 118_700, 145_320],
    deltaVsY1Pct: 348.5,
    positiveDirection: "up",
  },
  {
    key: "netIncome",
    label: "Net Income",
    sublabel: "Year 5",
    value: -535_180,
    formatted: "-$535.2K",
    spark: [-213_000, -254_000, -312_400, -396_900, -535_180],
    deltaVsY1Pct: -151.3,
    positiveDirection: "up",
  },
  {
    key: "expenses",
    label: "Total Expenses",
    sublabel: "Year 5",
    value: 557_240,
    formatted: "$557.2K",
    spark: [245_400, 312_100, 401_800, 478_600, 557_240],
    deltaVsY1Pct: 127.1,
    positiveDirection: "down",
  },
  {
    key: "properties",
    label: "Properties Managed",
    sublabel: "Active portfolio",
    value: 7,
    formatted: "7",
    spark: [1, 2, 4, 6, 7],
    deltaVsY1Pct: 600,
    positiveDirection: "up",
  },
];
