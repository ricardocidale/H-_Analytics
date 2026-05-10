/**
 * studying-lines.ts — the curated lexicon of short, evocative wait-state
 * messages The Analyst shows while studying. Single source of truth for
 * every research surface.
 *
 * Voice doctrine (binding):
 *   • `.claude/brand-voice-guidelines.md` §6 — approved gerunds: studying,
 *     reviewing, cross-referencing, checking, weighing, forming a view,
 *     mapping, tracing, reconciling, gauging, scanning.
 *     Forbidden: processing, generating, computing, loading, running,
 *     executing, consulting, thinking, analyzing, working.
 *   • `.claude/brand-voice-guidelines.md` §4 — loading copy is low-formality,
 *     medium-warmth, NO wit, specific to the work being done.
 *   • `.claude/rules/the-analyst-persona.md` — The Analyst writes like a
 *     Goldman Sachs research note: precise, opinionated, range-first.
 *   • `.agents/skills/analyst-research-buttons/SKILL.md` — the canonical
 *     surface skill that imports from this lexicon.
 *
 * Editing rules:
 *   • Every line MUST lead with one of the approved gerunds.
 *   • Every line MUST name a concrete artifact (a report, a market, a
 *     metric, a comp set) — never just the verb on its own.
 *   • Every line ends with a single horizontal ellipsis "…" (U+2026),
 *     never three dots "...".
 *   • No exclamation marks, no emoji, no first-person, no "Great question!"
 *     warmth. That voice belongs to Rebecca, not The Analyst.
 *   • Keep each line under 60 characters so it fits the inline indicator
 *     without truncation on common laptop widths.
 *   • Aim for 5–7 lines per topic so a 3.5s rotation cycles through the
 *     bank in roughly 18–25 seconds — long enough that a repeat reads as
 *     "still working", not as "stuck".
 */

export type StudyTopic =
  | "general"
  | "hospitality-benchmarks"
  | "market-adr"
  | "labor-rates"
  | "fb-benchmarks"
  | "seasonal"
  | "comp-set"
  | "constants"
  | "valuation"
  | "icp"
  | "risk"
  | "macro"
  | "revpar"
  | "exit"
  | "zoning"
  | "investor-sentiment";

export const STUDYING_LINES: Record<StudyTopic, readonly string[]> = {
  general: [
    "Studying current market data…",
    "Cross-referencing the latest reports…",
    "Reviewing recent observations…",
    "Checking source freshness…",
    "Weighing the evidence…",
    "Forming a view on the right ranges…",
    "Scanning the available data sources…",
    "Mapping the evidence to this market…",
    "Reconciling diverging source estimates…",
    "Gauging where this market sits today…",
  ],
  "hospitality-benchmarks": [
    "Studying STR and CoStar ADR observations…",
    "Cross-referencing the latest CBRE outlook…",
    "Reviewing PwC and HVS hospitality reports…",
    "Checking RevPAR trends across segments…",
    "Weighing benchmark evidence by tier…",
    "Forming a view on the right ranges to keep…",
    "Scanning STR chain-scale occupancy data…",
    "Mapping boutique performance vs. branded peers…",
    "Gauging ADR momentum vs. prior quarter…",
    "Tracing RevPAR trajectories by market class…",
  ],
  "market-adr": [
    "Studying quarterly ADR by market…",
    "Cross-referencing STR market data…",
    "Reviewing CBRE Hotel Outlook by city…",
    "Checking luxury, upscale, and boutique tiers…",
    "Weighing recent pricing momentum…",
    "Scanning boutique ADR vs. branded comps…",
    "Mapping rate compression in this corridor…",
    "Gauging ADR sensitivity to demand mix…",
    "Tracing rate trajectory since last quarter…",
  ],
  "labor-rates": [
    "Studying BLS occupational wage data…",
    "Cross-referencing AHLA compensation surveys…",
    "Reviewing market labor surveys…",
    "Checking hourly and salaried rates by role…",
    "Weighing market and segment differentials…",
    "Scanning local minimum wage trajectory…",
    "Gauging tipped vs. non-tipped cost spread…",
    "Reconciling FTE vs. outsourced rate structures…",
  ],
  "fb-benchmarks": [
    "Studying NRA restaurant operating metrics…",
    "Cross-referencing PKF F&B benchmarks…",
    "Reviewing ticket averages by property type…",
    "Checking cost-of-goods and labor percentages…",
    "Weighing F&B operating models…",
    "Scanning GOP margin ranges for F&B concepts…",
    "Mapping outlet mix to revenue share assumptions…",
    "Gauging capture rate vs. comp set…",
  ],
  seasonal: [
    "Studying seasonal demand patterns…",
    "Cross-referencing STR seasonal data…",
    "Reviewing peak, shoulder, and trough cycles…",
    "Checking month-by-month ADR multipliers…",
    "Weighing market-level seasonality…",
    "Scanning event-driven demand spikes…",
    "Mapping shoulder season compression for this market…",
    "Gauging year-over-year seasonal shift…",
    "Tracing trough month recovery curves…",
  ],
  "comp-set": [
    "Studying comparable properties in this market…",
    "Cross-referencing recent transactions…",
    "Reviewing the comp set's operating profile…",
    "Checking ADR and occupancy by competitor…",
    "Weighing the comp set's relevance…",
    "Scanning RevPAR index vs. comp set…",
    "Mapping comp-set share by segment…",
    "Reconciling comp-set ADR with this property's tier…",
    "Gauging how this property will index vs. peers…",
    "Tracing comp-set absorption of new supply…",
  ],
  constants: [
    "Studying the cited authority's latest publication…",
    "Cross-referencing the source-of-truth tables…",
    "Reviewing the regulatory record…",
    "Checking effective dates and applicability…",
    "Weighing the source against current convention…",
    "Scanning recent legislative updates…",
    "Tracing the published rate history…",
    "Reconciling authority-dictated vs. industry practice…",
  ],
  valuation: [
    "Studying recent transaction multiples…",
    "Cross-referencing cap-rate observations…",
    "Reviewing the discount-rate canon…",
    "Checking exit assumptions by segment…",
    "Weighing the valuation framework…",
    "Forming a view on the right exit cap…",
    "Scanning HVS transaction database…",
    "Mapping cap-rate compression in this corridor…",
    "Gauging buyer appetite for this asset class…",
    "Tracing cap rates across the past 12 months…",
    "Reconciling NOI-based vs. revenue-multiple approaches…",
  ],
  icp: [
    "Studying the ideal-customer profile…",
    "Cross-referencing portfolio fit signals…",
    "Reviewing the segment's deal history…",
    "Checking close-rate patterns…",
    "Weighing the ICP fit score…",
    "Scanning buyer persona match across markets…",
    "Gauging willingness-to-pay by guest segment…",
  ],
  risk: [
    "Studying the risk surface for this property…",
    "Cross-referencing market and operating risks…",
    "Reviewing covenant headroom…",
    "Checking sensitivity to rate moves…",
    "Weighing the downside cases…",
    "Forming a view on what investors will ask…",
    "Scanning macro tail risks for this market…",
    "Mapping leverage ratios to stress scenarios…",
    "Gauging DSCR headroom under rate shock…",
    "Tracing operating margin sensitivity to ADR moves…",
    "Reconciling optimistic vs. conservative build cases…",
  ],
  macro: [
    "Studying the rate environment and Fed trajectory…",
    "Cross-referencing SOFR forward curve…",
    "Reviewing CPI and lodging inflation trends…",
    "Checking hotel lending spread observations…",
    "Weighing macro headwinds vs. structural demand…",
    "Scanning treasury yield implications for cap rates…",
    "Gauging refinancing risk in the current cycle…",
    "Tracing debt market conditions for hotel assets…",
    "Reconciling rate expectations with operator guidance…",
  ],
  revpar: [
    "Studying RevPAR trajectory in this submarket…",
    "Cross-referencing STR RevPAR index by quarter…",
    "Reviewing occupancy-rate interplay with ADR…",
    "Checking RevPAR penetration vs. comp set…",
    "Weighing pricing strategy against demand capture…",
    "Scanning RevPAR recovery curve post-opening…",
    "Mapping ramp assumptions to comparable openings…",
    "Gauging stabilized RevPAR realism vs. peers…",
  ],
  exit: [
    "Studying exit timing scenarios for this asset class…",
    "Cross-referencing buyer depth in this market…",
    "Reviewing hold period assumptions by segment…",
    "Checking sale commission ranges in recent deals…",
    "Weighing 7- vs. 10-year hold implications…",
    "Scanning transaction velocity for boutique assets…",
    "Gauging market absorption capacity at exit…",
    "Tracing IRR sensitivity to exit year…",
    "Forming a view on optimal hold period…",
  ],
  zoning: [
    "Studying zoning and permit context…",
    "Cross-referencing local land-use restrictions…",
    "Reviewing ADU and accessory structure rules…",
    "Checking short-term rental licensing requirements…",
    "Weighing local regulatory risk on projections…",
    "Scanning recent permit approval timelines…",
    "Gauging entitlement risk for planned improvements…",
  ],
  "investor-sentiment": [
    "Studying investor appetite for this asset class…",
    "Cross-referencing LP preference data from recent raises…",
    "Reviewing yield expectations by risk profile…",
    "Checking comparable fund return distributions…",
    "Weighing current sentiment vs. 24-month average…",
    "Scanning family office interest in boutique hospitality…",
    "Gauging required returns for this asset type…",
    "Forming a view on LP thresholds for this deal…",
  ],
};

/**
 * Resolve a topic to its line bank. Falls back to "general" if the topic
 * isn't yet in the lexicon — better to ship a generic-but-on-brand line
 * than to crash a research surface waiting for a new bank to be added.
 */
export function studyingLinesFor(topic: StudyTopic | undefined): readonly string[] {
  if (topic && topic in STUDYING_LINES) return STUDYING_LINES[topic];
  return STUDYING_LINES.general;
}
