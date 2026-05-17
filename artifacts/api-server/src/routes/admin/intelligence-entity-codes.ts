/**
 * intelligence-entity-codes.ts — non-specialist entity codes for the
 * intelligence entities probe route.
 *
 * Plan: docs/plans/2026-05-17-005-agent-taxonomy-registry.md (Phase 2, Option A)
 *
 * The portal's full intelligence-entity-registry lives in the portal package
 * and cannot be imported by the api-server. This file is the Option A local
 * constants file: it declares only the orchestrator and agent entities that
 * the specialist routes cannot serve.
 *
 * Specialist probes remain on /api/admin/specialists/:id/probe.
 * Minion self-tests remain on /api/admin/minions/:id/self-test.
 *
 * Phase 3 follow-on (CC): after ORCHESTRATOR_SPECIALIST_ID is renamed
 * "gaspar" → "gustavo", this file picks up the change automatically via the
 * imported constant — no manual edit needed here.
 */

import {
  ORCHESTRATOR_SPECIALIST_ID,
  ORCHESTRATOR_IDENTITY,
} from "@engine/analyst/identity";

export interface IntelligenceEntityCode {
  /** Stable class-prefixed code. */
  readonly entityCode: string;
  readonly class: "orchestrator" | "agent";
  readonly humanName: string;
  /**
   * Backend ID used by the corresponding specialist or iris/rebecca endpoint.
   * Kept for reference; the intelligence-entities route does not forward to
   * another endpoint — it handles the response directly.
   */
  readonly backendId: string;
}

/** Stable entityCode for the Analyst Orchestrator (Gustavo). */
export const ORCHESTRATOR_ENTITY_CODE =
  `orch.${ORCHESTRATOR_IDENTITY.humanName.toLowerCase()}` as const;

/**
 * All non-specialist entities that the intelligence entities probe route serves.
 * Extend this list when new agent-class entities are added to the system.
 */
export const INTELLIGENCE_ENTITY_CODES: readonly IntelligenceEntityCode[] = [
  {
    entityCode: ORCHESTRATOR_ENTITY_CODE,
    class: "orchestrator",
    humanName: ORCHESTRATOR_IDENTITY.humanName,
    backendId: ORCHESTRATOR_SPECIALIST_ID,
  },
  {
    entityCode: "agent.rebecca",
    class: "agent",
    humanName: "Rebecca",
    backendId: "rebecca",
  },
  {
    entityCode: "agent.iris",
    class: "agent",
    humanName: "Iris",
    backendId: "iris",
  },
] as const;

/** Fast O(1) lookup map: entityCode → IntelligenceEntityCode. */
export const ENTITY_CODE_MAP: ReadonlyMap<string, IntelligenceEntityCode> =
  new Map(INTELLIGENCE_ENTITY_CODES.map((e) => [e.entityCode, e]));
