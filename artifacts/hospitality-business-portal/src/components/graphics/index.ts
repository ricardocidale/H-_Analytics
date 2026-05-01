/**
 * graphics/index.ts — Barrel export for the data-visualization layer.
 *
 * Re-exports all chart components (DonutChart, CashFlowRiver, Gauge),
 * layout primitives (KPIGrid, InsightPanel),
 * motion wrappers (AnimatedPage, ScrollReveal), and formatting helpers
 * (formatCompact, formatPercent, CHART_COLORS). These are the building
 * blocks used by every dashboard and detail page in the application.
 */
export { KPIGrid, type KPIItem } from "./KPIGrid";

export { DonutChart, type DonutSlice } from "./charts/DonutChart";
export { CashFlowRiver, type RiverSeries } from "./charts/CashFlowRiver";
export { Gauge } from "./charts/Gauge";

export { InsightPanel, type Insight } from "./InsightPanel";

export { AnimatedPage, AnimatedSection, AnimatedGrid, AnimatedGridItem, ScrollReveal } from "./AnimatedPage";

export { CHART_COLORS, formatCompact, formatPercent, formatPercentRaw, trendDirection, formatMoney } from "./formatters";
