/**
 * studying-lines.ts — the curated lexicon of short, evocative wait-state
 * messages The Analyst shows while studying. Single source of truth for
 * every research surface.
 *
 * Voice doctrine (binding):
 *   • `.claude/brand-voice-guidelines.md` §6 — approved gerunds: studying,
 *     reviewing, cross-referencing, checking, weighing, forming a view.
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
 *   • Every line MUST lead with one of the six approved gerunds.
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
  | "risk";

export const STUDYING_LINES: Record<StudyTopic, readonly string[]> = {
  general: [
    "Studying current market data…",
    "Cross-referencing the latest reports…",
    "Reviewing recent observations…",
    "Checking source freshness…",
    "Weighing the evidence…",
    "Forming a view on the right ranges…",
  ],
  "hospitality-benchmarks": [
    "Studying STR and CoStar ADR observations…",
    "Cross-referencing the latest CBRE outlook…",
    "Reviewing PwC and HVS hospitality reports…",
    "Checking RevPAR trends across segments…",
    "Weighing benchmark evidence by tier…",
    "Forming a view on the right ranges to keep…",
  ],
  "market-adr": [
    "Studying quarterly ADR by market…",
    "Cross-referencing STR market data…",
    "Reviewing CBRE Hotel Outlook by city…",
    "Checking luxury, upscale, and boutique tiers…",
    "Weighing recent pricing momentum…",
  ],
  "labor-rates": [
    "Studying BLS occupational wage data…",
    "Cross-referencing AHLA compensation surveys…",
    "Reviewing market labor surveys…",
    "Checking hourly and salaried rates by role…",
    "Weighing market and segment differentials…",
  ],
  "fb-benchmarks": [
    "Studying NRA restaurant operating metrics…",
    "Cross-referencing PKF F&B benchmarks…",
    "Reviewing ticket averages by property type…",
    "Checking cost-of-goods and labor percentages…",
    "Weighing F&B operating models…",
  ],
  seasonal: [
    "Studying seasonal demand patterns…",
    "Cross-referencing STR seasonal data…",
    "Reviewing peak, shoulder, and trough cycles…",
    "Checking month-by-month ADR multipliers…",
    "Weighing market-level seasonality…",
  ],
  "comp-set": [
    "Studying comparable properties in this market…",
    "Cross-referencing recent transactions…",
    "Reviewing the comp set's operating profile…",
    "Checking ADR and occupancy by competitor…",
    "Weighing the comp set's relevance…",
  ],
  constants: [
    "Studying the cited authority's latest publication…",
    "Cross-referencing the source-of-truth tables…",
    "Reviewing the regulatory record…",
    "Checking effective dates and applicability…",
    "Weighing the source against current convention…",
  ],
  valuation: [
    "Studying recent transaction multiples…",
    "Cross-referencing cap-rate observations…",
    "Reviewing the discount-rate canon…",
    "Checking exit assumptions by segment…",
    "Weighing the valuation framework…",
    "Forming a view on the right exit cap…",
  ],
  icp: [
    "Studying the ideal-customer profile…",
    "Cross-referencing portfolio fit signals…",
    "Reviewing the segment's deal history…",
    "Checking close-rate patterns…",
    "Weighing the ICP fit score…",
  ],
  risk: [
    "Studying the risk surface for this property…",
    "Cross-referencing market and operating risks…",
    "Reviewing covenant headroom…",
    "Checking sensitivity to rate moves…",
    "Weighing the downside cases…",
    "Forming a view on what investors will ask…",
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
