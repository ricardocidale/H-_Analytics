/**
 * Gaspar — orchestrator identity.
 *
 * The orchestrator (formerly "The Analyst") is humanized as Gaspar so that
 * activity logs, narration, and admin-facing UX read as a named team
 * rather than a faceless pipeline. Gaspar coordinates the 12 Specialists
 * declared in `engine/analyst/registry/specialist-catalog.ts`.
 *
 * This module is the SINGLE source of truth for the orchestrator persona.
 * Anywhere the engine narrates "the orchestrator decided …" or "the
 * Analyst dispatched …", import from here instead of hard-coding strings.
 */

export interface OrchestratorIdentity {
  /**
   * Canonical first name used in narration. Mirrors the `humanName` field
   * on each Specialist so callsites can treat orchestrator and Specialists
   * uniformly when rendering badges / log prefixes.
   */
  readonly humanName: "Gaspar";
  /** Back-compat alias for `humanName`. */
  readonly name: "Gaspar";
  /** Persona role line for activity-log subheadings. */
  readonly role: "Orchestrator";
  /**
   * Persona gender for pronoun selection in narration helpers. Mirrors
   * the `gender` enum on Specialists (`male | female | neutral`).
   */
  readonly gender: "male";
  /**
   * Lower-case identifier used as the bracketed log prefix:
   *   `[gaspar] dispatched Helena to refresh tax constants`
   */
  readonly logKey: "gaspar";
  /** 1-line description rendered above the orchestrator dashboard. */
  readonly description: string;
  /**
   * Voice doctrine for narration produced under Gaspar's name. Used by
   * prompt builders and copy reviewers so the persona reads consistently
   * across activity logs, refresh theaters, and status banners.
   */
  readonly voice: {
    /** Language to narrate in. */
    readonly language: "en";
    /** Grammatical person used in narration ("I dispatched Helena …"). */
    readonly person: "first";
    /** Tonal register — calm, factual, no hype. */
    readonly tone: "calm";
    /** Length budget per narration line. */
    readonly length: "brief";
    /** Whether emojis are permitted in narration. */
    readonly emojis: false;
  };
}

export const GASPAR_IDENTITY: OrchestratorIdentity = {
  humanName: "Gaspar",
  name: "Gaspar",
  role: "Orchestrator",
  gender: "male",
  logKey: "gaspar",
  description:
    "Coordinates the team of 12 Specialists, dispatches research jobs, and reconciles their outputs into the model.",
  voice: {
    language: "en",
    person: "first",
    tone: "calm",
    length: "brief",
    emojis: false,
  },
} as const;
