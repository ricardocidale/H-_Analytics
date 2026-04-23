// UNWIRED — blocking on: Phase 3 (Task #453 — Gaspar identity + pronoun helper)
//   This module is the persona seam landed in Phase 2a so Phase 3 can wire
//   pronoun helpers and orchestrator narration without touching the catalog
//   again. First import lands when the orchestrator dispatch path adopts
//   `GASPAR_IDENTITY` for activity-log subheadings.
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
 *
 * Phase 2a scope: identity constants only. Pronoun helpers, log prefix
 * derivation, and admin override surfaces land in Phases 3 and 4.
 */

export interface OrchestratorIdentity {
  /** Canonical first name used in narration. */
  readonly name: "Gaspar";
  /** Persona role line for activity-log subheadings. */
  readonly role: "Orchestrator";
  /** Pronoun set used by narration helpers (P3). */
  readonly gender: "male";
  /**
   * Lower-case identifier used as the bracketed log prefix:
   *   `[gaspar] dispatched Helena to refresh tax constants`
   */
  readonly logKey: "gaspar";
  /** 1-line description rendered above the orchestrator dashboard. */
  readonly description: string;
}

export const GASPAR_IDENTITY: OrchestratorIdentity = {
  name: "Gaspar",
  role: "Orchestrator",
  gender: "male",
  logKey: "gaspar",
  description:
    "Coordinates the team of 12 Specialists, dispatches research jobs, and reconciles their outputs into the model.",
} as const;
