/**
 * property-research/index.ts
 *
 * Barrel export for the AI-powered property market research feature.
 * When a user clicks "Consult" on a property, the system streams
 * structured JSON from an LLM (via SSE) containing market data, ADR comps,
 * occupancy benchmarks, cap rates, competitive landscape, and risk factors.
 *
 *   • useResearchStream – React hook that manages the SSE connection, streams
 *                         tokens, and parses the accumulated JSON into a typed
 *                         research object
 *   • ResearchSections  – renders the parsed research into categorised cards
 *   • SectionCard       – reusable card wrapper with icon, title, and accent color
 *   • MetricCard        – a small KPI badge used inside section cards
 *   • sectionColors     – color scheme map keyed by research category
 */
export { SectionCard } from "./SectionCard";
export { MetricCard } from "./MetricCard";
export { ConfidenceBadge } from "./ConfidenceBadge";
export { ProvenanceBadge } from "./ProvenanceBadge";
export { RateSparkline } from "./RateSparkline";
export { SourceCitations } from "./SourceCitations";
export { MarketRateBenchmark } from "./MarketRateBenchmark";
export { ResearchSections } from "./ResearchSections";
export { useResearchStream } from "./useResearchStream";
export { sectionColors } from "./types";
export type { SectionColorScheme } from "./types";
