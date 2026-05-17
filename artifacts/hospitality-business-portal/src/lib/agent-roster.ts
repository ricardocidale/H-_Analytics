/**
 * agent-roster.ts — read-only roster aggregator for the Intelligence
 * sidebar's Agent Roster group (Task #1389).
 *
 * Returns a normalized `RosterEntry[]` for each entity class
 * (Agents / Specialists / Minions) sourced from the existing taxonomy
 * (`AGENTS`, `MINIONS`) and the Specialist catalog. No new persistence —
 * the roster is derived purely from in-code definitions.
 *
 * Health is intentionally NOT fetched here; the accordion fetches
 * `/api/admin/agent-roster/health` on mount to surface the most recent
 * already-tracked health signal per entity (specialist resource health,
 * Iris last-run, Rebecca KB stats). Initial state is `unknown` so we
 * never display a fake green before that signal arrives. Minions also
 * start `unknown` and admins can run an on-demand self-test per minion
 * via the Analyst button — see `runMinionSelfTest` on the server side
 * (Task #1392).
 */

import { AGENTS, MINIONS } from "@/lib/agent-taxonomy";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";
import { ORCHESTRATOR_SPECIALIST_ID } from "@engine/analyst/identity";
import { getEntityByBackendId } from "@/lib/intelligence-entity-registry";

export type RosterClass = "agent" | "specialist" | "minion";

/** Initial liveness state shown before any tracked signal is read. */
export type RosterHealth = "unknown" | "healthy" | "degraded" | "error" | "not-applicable";

export interface RosterEntry {
  /** Stable id used as the probe target — also the accordion key. */
  id: string;
  /**
   * Class-prefixed entity code from the intelligence-entity-registry.
   * Format: orch.<name> | spec.<letter> | agent.<id> | minion.<id>
   * Used by the accordion to route probe requests to the correct endpoint.
   */
  entityCode: string;
  class: RosterClass;
  humanName: string;
  role: string;
  description: string;
  /** Surfaces / pipelines / tools where this entity is consumed. */
  whereUsed: string[];
  /** Default health state — `not-applicable` for minions (no LLM probe). */
  initialHealth: RosterHealth;
}

// ── Per-agent metadata table ────────────────────────────────────────────────
//
// Drives the Agents roster taxonomy-driven. Anyone adding a new agent-class
// entity declares it in `AGENTS` (taxonomy) and adds a row here for the
// description + where-used surfaces. No agent should be hardcoded inside the
// roster aggregator below.

interface AgentDescriptor {
  /** Stable id used by the probe endpoint and the health-signal map. */
  id: string;
  /** Source of truth for human name + role. */
  source: { humanName: string; role: string };
  description: string;
  whereUsed: string[];
}

const AGENT_DESCRIPTORS: AgentDescriptor[] = [
  // Gustavo — Analyst Orchestrator. Lives in the Specialist catalog under
  // the orchestrator id, but conceptually is an Agent so it surfaces here.
  {
    id: ORCHESTRATOR_SPECIALIST_ID,
    source: { humanName: "Gustavo", role: "Analyst Orchestrator" },
    description:
      "Analyst Orchestrator. Routes research jobs across the Specialist team and reconciles their outputs into the model.",
    whereUsed: ["The Analyst", "Specialist dispatch", "Research synthesis"],
  },
  ...Object.entries(AGENTS).map(([id, def]): AgentDescriptor => {
    if (id === "rebecca") {
      return {
        id,
        source: def,
        description:
          "Conversational AI assistant embedded across the portal. Answers questions, drafts insights, and surfaces source-cited research with admins in the loop.",
        whereUsed: ["Rebecca chat panel", "Knowledge base Q&A", "Conversations"],
      };
    }
    if (id === "iris") {
      return {
        id,
        source: def,
        description:
          "Resource maintainer that keeps the knowledge base, retrieval gaps, and reference data fresh in the background.",
        whereUsed: ["Knowledge base reindex", "Retrieval gap monitor", "Resource health"],
      };
    }
    return {
      id,
      source: def,
      description: `${def.humanName} — ${def.role}.`,
      whereUsed: [],
    };
  }),
];

// ── Public API ──────────────────────────────────────────────────────────────

export function getAgentsRoster(): RosterEntry[] {
  return AGENT_DESCRIPTORS.map((d) => {
    const regEntry = getEntityByBackendId(d.id);
    return {
      id: d.id,
      entityCode: regEntry?.entityCode ?? d.id,
      class: "agent" as const,
      humanName: d.source.humanName,
      role: d.source.role,
      description: d.description,
      whereUsed: d.whereUsed,
      initialHealth: "unknown" as const,
    };
  });
}

export function getSpecialistsRoster(): RosterEntry[] {
  return [...SPECIALIST_CATALOG]
    .filter((d) => d.id !== ORCHESTRATOR_SPECIALIST_ID)
    .sort((a, b) => a.letter.localeCompare(b.letter))
    .map((d) => ({
      id: d.id,
      entityCode: `spec.${d.letter}`,
      class: "specialist" as const,
      humanName: d.humanName ?? d.realName,
      role: d.displayName ?? d.realName,
      description: d.description ?? `${d.realName} Specialist.`,
      whereUsed: [`Subject: ${d.subject}`],
      initialHealth: "unknown" as const,
    }));
}

export function getMinionsRoster(): RosterEntry[] {
  return Object.values(MINIONS).map((m) => ({
    id: m.id,
    entityCode: `minion.${m.id}`,
    class: "minion" as const,
    humanName: m.label,
    role: m.role,
    description: m.description,
    whereUsed: ["Slide Factory pipeline"],
    // Minions are deterministic helpers — no LLM probe applies, but each
    // one ships a tiny self-test (Task #1392) that admins can re-run from
    // the Analyst button. Status starts `unknown` until the self-test runs
    // so we never display a fake green badge.
    initialHealth: "unknown" as const,
  }));
}

// ── Tracked health signal (server) ─────────────────────────────────────────

export interface RosterHealthSignal {
  status: Exclude<RosterHealth, "not-applicable">;
  source: string;
  checkedAt: string | null;
  message?: string;
}

export interface RosterCostantinoCycle {
  lastRunAt: string | null;
  status: "ok" | "warn" | "error" | null;
  notes: string | null;
  considered: number;
  succeeded: number;
  failed: number;
}

export interface MinionSelfTestHistoryItem {
  /** "pass" | "fail" | "skipped" — kept loose so server-side additions don't break the client. */
  status: string;
  durationMs: number;
  message: string | null;
  /** ISO-8601 timestamp. */
  ranAt: string;
}

export interface RosterHealthResponse {
  entries: Record<string, RosterHealthSignal>;
  generatedAt: string;
  /**
   * Most recent Costantino (Data Custodian) cycle outcome — drives the
   * "Last audited X ago" indicator at the top of the roster (Task #1391).
   * `lastRunAt: null` means the scheduler has not fired its first cycle
   * yet (fresh DB / fresh deploy).
   */
  costantinoCycle?: RosterCostantinoCycle;
  /**
   * Most recent minion-self-test scheduler cycle outcome — drives the
   * "Tests last ran X ago — N pass / N fail" indicator at the top of the
   * Minions roster (Task #1397). `lastRunAt: null` means the scheduler
   * has not fired its first cycle yet.
   */
  minionSelfTestCycle?: RosterCostantinoCycle;
  /**
   * Per-minion append-only self-test history (Task #1396), most-recent
   * first, capped at `minionHistoryStrip` rows per minion. Each manual
   * Analyst-button click on a minion row is persisted server-side so the
   * roster can render a compact pass/fail dot strip — admins spot
   * intermittent failures over time, not just the most recent click.
   */
  minionHistory?: Record<string, MinionSelfTestHistoryItem[]>;
  minionHistoryStrip?: number;
}
