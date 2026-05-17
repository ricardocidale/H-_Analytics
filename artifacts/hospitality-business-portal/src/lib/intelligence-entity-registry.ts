/**
 * intelligence-entity-registry.ts — single source of truth for every entity
 * in the H+ Intelligence system: orchestrator, specialists, agents, minions.
 *
 * Plan: docs/plans/2026-05-17-005-agent-taxonomy-registry.md (Phase 1)
 *
 * The registry is JSON-serializable and authoritative for portal rendering.
 * It derives entries from the three existing sources rather than duplicating:
 *   • Orchestrator  — @engine/analyst/identity
 *   • Specialists   — @engine/analyst/registry/specialist-catalog (SPECIALIST_CATALOG)
 *   • Agents        — @/lib/agent-taxonomy (AGENTS)
 *   • Minions       — @/lib/agent-taxonomy (MINIONS)
 *
 * Entity codes (entityCode field) are class-prefixed and stable:
 *   orch.<humanName>   e.g. orch.gustavo
 *   spec.<letter>      e.g. spec.A … spec.Q
 *   agent.<id>         e.g. agent.rebecca, agent.iris
 *   minion.<id>        e.g. minion.aldo, minion.carlo
 *
 * IMPORTANT: entityCode is a routing/rendering overlay only.
 * Persisted DB IDs (dotted specialist IDs like "mgmt-co.funding") are unchanged.
 */

import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";
import {
  ORCHESTRATOR_SPECIALIST_ID,
  ORCHESTRATOR_IDENTITY,
} from "@engine/analyst/identity";
import { AGENTS, MINIONS } from "@/lib/agent-taxonomy";

// ── Registry entry shape ────────────────────────────────────────────────────

export interface EntityRegistryEntry {
  /**
   * Stable, class-prefixed code. Never changes after creation.
   * Format: orch.<name> | spec.<letter> | agent.<id> | minion.<id>
   */
  readonly entityCode: string;

  /**
   * Entity class. Used for class-label display and probe routing.
   * Note: the orchestrator carries class "orchestrator" in the registry
   * but surfaces under the "Agents" UI group in the roster.
   */
  readonly class: "orchestrator" | "specialist" | "agent" | "minion";

  /** Human persona name shown in admin UI. */
  readonly humanName: string;

  /** One-line role description. */
  readonly role: string;

  /**
   * Backend ID used by probe and config API endpoints.
   * For specialists: dotted ID (e.g. "mgmt-co.funding").
   * For orchestrator: ORCHESTRATOR_SPECIALIST_ID (currently "gaspar").
   * For agents/minions: plain id (e.g. "rebecca", "aldo").
   *
   * Phase 3 (CC): after ORCHESTRATOR_SPECIALIST_ID is renamed from
   * "gaspar" → "gustavo", update this file's import only — entityCode stays.
   */
  readonly backendId: string;

  /** Specialist letter (A–Q). null for all other classes. */
  readonly letter: string | null;

  /** Short description for roster cards. */
  readonly description: string;
}

// ── Registry builder ────────────────────────────────────────────────────────

function buildRegistry(): readonly EntityRegistryEntry[] {
  const entries: EntityRegistryEntry[] = [];

  // ── Orchestrator (Gustavo) ────────────────────────────────────────────────
  entries.push({
    entityCode: `orch.${ORCHESTRATOR_IDENTITY.humanName.toLowerCase()}`,
    class: "orchestrator",
    humanName: ORCHESTRATOR_IDENTITY.humanName,
    role: ORCHESTRATOR_IDENTITY.role,
    backendId: ORCHESTRATOR_SPECIALIST_ID,
    letter: null,
    description:
      "Analyst Orchestrator. Routes research jobs across the Specialist team and reconciles their outputs into the model.",
  });

  // ── Specialists (A–Q from SPECIALIST_CATALOG) ─────────────────────────────
  for (const def of SPECIALIST_CATALOG) {
    entries.push({
      entityCode: `spec.${def.letter}`,
      class: "specialist",
      humanName: def.humanName ?? def.realName,
      role: def.displayName ?? def.realName,
      backendId: def.id,
      letter: def.letter,
      description: def.description ?? `${def.realName} Specialist.`,
    });
  }

  // ── Agents (Rebecca, Iris) ─────────────────────────────────────────────────
  for (const [id, def] of Object.entries(AGENTS)) {
    entries.push({
      entityCode: `agent.${id}`,
      class: "agent",
      humanName: def.humanName,
      role: def.role,
      backendId: id,
      letter: null,
      description: def.secondary,
    });
  }

  // ── Minions (Aldo, Carlo, Dino, Enzo, Fabio) ──────────────────────────────
  for (const m of Object.values(MINIONS)) {
    entries.push({
      entityCode: `minion.${m.id}`,
      class: "minion",
      humanName: m.label,
      role: m.role,
      backendId: m.id,
      letter: null,
      description: m.description,
    });
  }

  return Object.freeze(entries);
}

export const INTELLIGENCE_ENTITY_REGISTRY: readonly EntityRegistryEntry[] =
  buildRegistry();

// ── Lookup helpers ───────────────────────────────────────────────────────────

/** Look up an entity by its stable entityCode. */
export function getEntityByCode(
  entityCode: string,
): EntityRegistryEntry | undefined {
  return INTELLIGENCE_ENTITY_REGISTRY.find((e) => e.entityCode === entityCode);
}

/**
 * Look up an entity by its backend ID (the id used in API calls).
 * For the orchestrator this is ORCHESTRATOR_SPECIALIST_ID ("gaspar" until Phase 3).
 * For specialists this is the dotted id (e.g. "mgmt-co.funding").
 */
export function getEntityByBackendId(
  backendId: string,
): EntityRegistryEntry | undefined {
  return INTELLIGENCE_ENTITY_REGISTRY.find((e) => e.backendId === backendId);
}
