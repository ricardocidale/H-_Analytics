/**
 * agent-taxonomy.ts — canonical user-facing labels for every tier and named
 * agent in the H+ Analytics Intelligence system.
 *
 * ALL UI surfaces must import from this file instead of hardcoding strings.
 * Changing a label here propagates everywhere automatically.
 *
 * Hierarchy:
 *   The Analyst (system brand) → Gustavo [Orchestrator] → Specialists [Agents] (16 researchers)
 *   Slide Factory (system brand) → Marco [Orchestrator] → Teams → Members → Minions (hidden)
 *   Standalone Agents: Rebecca, Iris
 */

// ── Tier labels ────────────────────────────────────────────────────────────

/** The top-level brand label for the full AI research capability. */
export const ANALYST_BRAND = "The Analyst" as const;

/** Tier role labels used in secondary / subtitle positions. */
export const TIER_LABELS = {
  orchestrator: "Orchestrator",
  agent: "Agent",
  team: "Team",
  swarm: "Swarm",
  minion: "Minion",
} as const;

// ── Named orchestrators ────────────────────────────────────────────────────

export const ORCHESTRATORS = {
  gustavo: {
    humanName: "Gustavo",
    role: "Analyst Orchestrator",
    brand: ANALYST_BRAND,
    /** Full label shown in detail views: "<humanName> · <role>" */
    detailLabel: "Gustavo · Analyst Orchestrator",
    system: "The Analyst",
  },
  marco: {
    humanName: "Marco",
    role: "Orchestrator",
    brand: "Slide Factory",
    /** Header shown in the Slide Factory pipeline view */
    swarmHeader: "Marco — Orchestrating Swarm (6 teams)",
    system: "Slide Factory",
  },
} as const;

// ── Named agents ──────────────────────────────────────────────────────────

export const AGENTS = {
  rebecca: {
    humanName: "Rebecca",
    role: "AI Assistant",
    secondary: "AI Assistant",
  },
  iris: {
    humanName: "Iris",
    role: "Resource Maintainer",
    secondary: "Resource Maintainer",
  },
} as const;

// ── Slide Factory team members ─────────────────────────────────────────────

/** Human names for the 6 slide-building agents (indexed by slide number 1-6). */
export const SLIDE_AGENT_NAMES: Record<number, string> = {
  1: "Sofia",
  2: "Bianca",
  3: "Chiara",
  4: "Dario",
  5: "Elisa",
  6: "Felix",
} as const;

/**
 * Team composition descriptor for each slide agent (shown as a secondary chip).
 * Format: "<role pipeline>" — used in the "Team · Slide N" chip context.
 */
export const SLIDE_TEAM_TAGS: Record<number, string> = {
  1: "Reader→Builder→Inspector",
  2: "Reader→Builder→Inspector",
  3: "Reader→Builder→Inspector",
  4: "Builder→Inspector",
  5: "Reader→Builder→Inspector",
  6: "5-step USALI",
} as const;

/**
 * Returns the persona-first row label for the build step.
 * E.g. "Sofia — Building Slide 1"
 */
export function slideAgentRowLabel(slideNum: number): string {
  const name = SLIDE_AGENT_NAMES[slideNum] ?? `Slide ${slideNum} Agent`;
  return `${name} — Building Slide ${slideNum}`;
}

// ── Named minions ─────────────────────────────────────────────────────────

/**
 * Minion labels — narrow deterministic utilities, hidden by default.
 * Only shown inside "Technical Details" in the Slide Factory ingestion step.
 */
export const MINIONS = {
  aldo: {
    id: "aldo",
    label: "Aldo",
    role: "PDF Extractor",
    description: "PDF text extraction — word-level bounding boxes",
  },
  carlo: {
    id: "carlo",
    label: "Carlo",
    role: "Schema Validator",
    description: "Zod schema validation — font metrics and types",
  },
  bruno: {
    id: "bruno",
    label: "Bruno",
    role: "Utility",
    description: "Pipeline utility",
  },
  dino: {
    id: "dino",
    label: "Dino",
    role: "Pixel Diff Inspector",
    description: "Pixel-diff comparison between rendered and canonical slide",
  },
  enzo: {
    id: "enzo",
    label: "Enzo",
    role: "Utility",
    description: "Pipeline utility",
  },
} as const;

/** Minion IDs — these are hidden by default and only shown in Technical Details. */
export const MINION_IDS = new Set(Object.keys(MINIONS));

// ── Run type labels ────────────────────────────────────────────────────────

/** User-facing labels for the three run types surfaced in the Unified Runs page. */
export const RUN_TYPE_LABELS = {
  analyst: "Analyst",
  slide: "Slide Factory",
  iris: "Iris",
} as const;

export type RunType = keyof typeof RUN_TYPE_LABELS;

// ── Nav group labels ────────────────────────────────────────────────────────

/** Canonical nav group labels used in IntelligenceSidebar. */
export const NAV_GROUP_LABELS = {
  analyst: "Analyst",
  agents: "Agents",
  runs: "Runs",
  knowledgeResources: "Knowledge & Resources",
  system: "System",
} as const;
