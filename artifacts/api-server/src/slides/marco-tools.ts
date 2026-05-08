/**
 * Marco's primitive tools — Unit 1 + Unit 7.
 *
 * Marco is the slide factory orchestrator. Its tools are atomic primitives,
 * not bundled workflows: each tool does one thing, returns rich data, and
 * encodes no decision logic. Marco's system prompt drives sequencing.
 *
 * Tools:
 *   read_run             → fetch run state (status + slot drafts + assignments)
 *   dispatch_slide_team  → invoke per-slide team via U4 swarm dispatcher
 *   invoke_maya          → run Maya cross-app content judge for one slide
 *   invoke_dino          → run Dino pixel-diff agent for one slide
 *   update_agent_result  → write one slide's verdict (raw signals; handler computes approved/rejected)
 *   transition_status    → move the run to 'complete' or 'error'
 *   complete_task        → exit signal for the bounded tool loop
 *
 * Approval logic lives in handleUpdateAgentResult (deterministic), NOT in
 * Marco's system prompt. Marco passes raw signals through; the handler decides.
 *
 * See:
 *   docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md
 *   docs/solutions/architecture-patterns/rebecca-agent-native-architecture-2026-05-05.md
 */
import type Anthropic from "@anthropic-ai/sdk";
import {
  getSlideFactoryRunById,
  updateSlideFactoryRun,
  updateAgentResult,
} from "../storage/slide-factory-runs";
import type { SlideAgentResult } from "../storage/slide-factory-runs";
import { dispatchSlideTeam } from "./swarms/dispatch";
import type { SlideTeamInput, SlideTeamOutput, SlideNumber } from "./swarms/types";
import type { LuccaSlotDraft } from "@workspace/db";
import { runMaya } from "./maya";
import type { MayaVerdictLevel } from "./maya";
import { runDino } from "./dino";
import { CANONICAL_ASSETS } from "./canonical-assets";
import { TOTAL_SLIDES } from "./deck-render-constants";

const SLIDE_NUMBER_RANGE_DESC = `Slide number in 1..${TOTAL_SLIDES}`;
const SLIDE_NUMBER_MIN = 1;

/**
 * In-memory cache: payloadV2 produced by dispatch_slide_team, consumed by
 * invoke_maya. Keyed as `${runId}:${slideNumber}`. Deleted immediately after
 * Maya reads it to prevent unbounded growth.
 */
const dispatchedPayloads = new Map<string, unknown>();

// ── Tool schemas (Anthropic.Tool) ────────────────────────────────────────────

export const MARCO_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_run",
    description:
      "Fetch the slide_factory_runs row for the run Marco is orchestrating. Returns status, property assignments per slide, and the per-slide slot draft keys.",
    input_schema: {
      type: "object",
      required: ["runId"],
      properties: {
        runId: { type: "number", description: "Slide factory run id" },
      },
    },
  },
  {
    name: "dispatch_slide_team",
    description:
      `Dispatch the per-slide swarm team for one slide (Sofia=slide ${SLIDE_NUMBER_MIN}, then Bianca, Chiara, Dario, Elisa, Felix in order through slide ${TOTAL_SLIDES}). Returns the team's SlideTeamOutput { status, notes }.`,
    input_schema: {
      type: "object",
      required: ["runId", "slideNumber"],
      properties: {
        runId: { type: "number", description: "Slide factory run id" },
        slideNumber: {
          type: "integer",
          minimum: SLIDE_NUMBER_MIN,
          maximum: TOTAL_SLIDES,
          description: SLIDE_NUMBER_RANGE_DESC,
        },
      },
    },
  },
  {
    name: "invoke_maya",
    description:
      "Run Maya (cross-app content judge) for one slide. Call after dispatch_slide_team succeeds. Returns { verdict, headline, notes }. Pass verdict and notes to update_agent_result.",
    input_schema: {
      type: "object",
      required: ["runId", "slideNumber"],
      properties: {
        runId: { type: "number", description: "Slide factory run id" },
        slideNumber: {
          type: "integer",
          minimum: SLIDE_NUMBER_MIN,
          maximum: TOTAL_SLIDES,
          description: SLIDE_NUMBER_RANGE_DESC,
        },
      },
    },
  },
  {
    name: "invoke_dino",
    description:
      "Run Dino (pixel-diff agent) for one slide. Call after invoke_maya. Returns { pixelDiffPct, exceedsThreshold, threshold }. Pass exceedsThreshold to update_agent_result.",
    input_schema: {
      type: "object",
      required: ["runId", "slideNumber"],
      properties: {
        runId: { type: "number", description: "Slide factory run id" },
        slideNumber: {
          type: "integer",
          minimum: SLIDE_NUMBER_MIN,
          maximum: TOTAL_SLIDES,
          description: SLIDE_NUMBER_RANGE_DESC,
        },
      },
    },
  },
  {
    name: "update_agent_result",
    description:
      "Write one slide's verdict to agentResults JSONB. Pass the raw signals from dispatch_slide_team (teamStatus), invoke_maya (mayaVerdict, mayaNotes), and invoke_dino (dinoPixelDiffPct, dinoExceedsThreshold). The handler computes approved/rejected — do not interpret these yourself.",
    input_schema: {
      type: "object",
      required: ["runId", "slideNumber", "teamStatus", "mayaVerdict", "dinoPixelDiffPct", "dinoExceedsThreshold"],
      properties: {
        runId: { type: "number", description: "Slide factory run id" },
        slideNumber: {
          type: "integer",
          minimum: SLIDE_NUMBER_MIN,
          maximum: TOTAL_SLIDES,
          description: SLIDE_NUMBER_RANGE_DESC,
        },
        teamStatus: {
          type: "string",
          enum: ["ok", "block", "fail"],
          description: "Status from dispatch_slide_team",
        },
        mayaVerdict: {
          type: "string",
          enum: ["ok", "advisory", "warning", "block"],
          description: "Verdict from invoke_maya",
        },
        mayaHeadline: {
          type: ["string", "null"],
          description: "Headline from invoke_maya; null if unavailable",
        },
        mayaNotes: {
          type: ["string", "null"],
          description: "Notes from invoke_maya; null if none",
        },
        dinoPixelDiffPct: {
          type: "number",
          description: "pixelDiffPct from invoke_dino",
        },
        dinoExceedsThreshold: {
          type: "boolean",
          description: "exceedsThreshold from invoke_dino",
        },
      },
    },
  },
  {
    name: "transition_status",
    description:
      "Move the run's overall status to 'complete' (all slides approved) or 'error' (any slide rejected). Call once after all six slides have agentResults written.",
    input_schema: {
      type: "object",
      required: ["runId", "newStatus"],
      properties: {
        runId: { type: "number", description: "Slide factory run id" },
        newStatus: {
          type: "string",
          enum: ["complete", "error"],
          description: "Final status",
        },
      },
    },
  },
  {
    name: "complete_task",
    description:
      "Signal that Marco has finished orchestrating this run. Always call last. The summary is logged for diagnostics.",
    input_schema: {
      type: "object",
      required: ["summary"],
      properties: {
        summary: { type: "string", description: "One-sentence recap of what Marco did" },
      },
    },
  },
];

// ── Tool dispatcher ──────────────────────────────────────────────────────────

export interface MarcoToolContext {
  runId: number;
}

export interface MarcoToolResult {
  result: unknown;
  /** Set by complete_task to break the agent loop */
  finalSummary?: string;
}

/**
 * Dispatch a single Marco tool call. Returns a structured result the agent
 * loop will JSON-stringify into a tool_result block.
 *
 * Uses the bare {@link MarcoToolContext} for in-process invocation. Errors
 * are caught and returned as `{ error: string }` so the agent can react
 * without the loop crashing — primitive-tool philosophy: surface failures,
 * don't throw across the agent boundary.
 */
export async function dispatchMarcoTool(
  name: string,
  args: Record<string, unknown>,
  ctx: MarcoToolContext,
): Promise<MarcoToolResult> {
  try {
    switch (name) {
      case "read_run":
        return { result: await handleReadRun(asNumber(args.runId)) };

      case "dispatch_slide_team":
        return {
          result: await handleDispatchTeam(
            asNumber(args.runId),
            asSlideNumber(args.slideNumber),
          ),
        };

      case "invoke_maya":
        return {
          result: await handleInvokeMaya(
            asNumber(args.runId),
            asSlideNumber(args.slideNumber),
          ),
        };

      case "invoke_dino":
        return {
          result: await handleInvokeDino(
            asNumber(args.runId),
            asSlideNumber(args.slideNumber),
          ),
        };

      case "update_agent_result":
        return {
          result: await handleUpdateAgentResult(
            asNumber(args.runId),
            asSlideNumber(args.slideNumber),
            asEnum(args.teamStatus, ["ok", "block", "fail"] as const),
            asEnum(args.mayaVerdict, ["ok", "advisory", "warning", "block"] as const),
            (args.mayaHeadline as string | null | undefined) ?? null,
            (args.mayaNotes as string | null | undefined) ?? null,
            asNumber(args.dinoPixelDiffPct),
            asBoolean(args.dinoExceedsThreshold),
          ),
        };

      case "transition_status":
        return {
          result: await handleTransitionStatus(
            asNumber(args.runId),
            asEnum(args.newStatus, ["complete", "error"] as const),
          ),
        };

      case "complete_task":
        return {
          result: { ok: true, summary: args.summary },
          finalSummary: String(args.summary ?? ""),
        };

      default:
        return { result: { error: `Unknown tool: ${name}` } };
    }
  } catch (err: unknown) {
    return { result: { error: err instanceof Error ? err.message : String(err) } };
  }
}

// ── Tool handlers ────────────────────────────────────────────────────────────

async function handleReadRun(runId: number) {
  const run = await getSlideFactoryRunById(runId);
  if (!run) return { error: `Run ${runId} not found` };

  return {
    id: run.id,
    status: run.status,
    slide1PropertyId: run.slide1PropertyId,
    slide2PropertyId: run.slide2PropertyId,
    slide3PropertyId: run.slide3PropertyId,
    slide5PropertyId: run.slide5PropertyId,
    luccaDraftKeys: Object.keys(run.luccaDraft ?? {}),
    agentResultsKeys: Object.keys(run.agentResults ?? {}),
    briefR2Key: run.briefR2Key,
  };
}

async function handleDispatchTeam(runId: number, slideNumber: SlideNumber) {
  const run = await getSlideFactoryRunById(runId);
  if (!run) return { error: `Run ${runId} not found` };

  const luccaDraft = run.luccaDraft ?? {};
  const slidePrefix = `slide${slideNumber}.`;
  const slotDrafts = Object.fromEntries(
    Object.entries(luccaDraft).filter(([k]) => k.startsWith(slidePrefix)),
  );

  const input: SlideTeamInput = {
    runId,
    slideNumber,
    slotDrafts,
    financialInputs: null,
    canonicalPngKey: CANONICAL_ASSETS.slide(slideNumber, "png"),
    briefR2Key: run.briefR2Key,
  };

  const output: SlideTeamOutput = await dispatchSlideTeam(input);

  // Cache payloadV2 for invoke_maya — deleted there after read
  const cacheKey = `${runId}:${slideNumber}`;
  dispatchedPayloads.set(cacheKey, output.payloadV2);

  return {
    slideNumber: output.slideNumber,
    status: output.status,
    notes: output.notes,
    // payloadV2 not echoed to LLM — large and Marco doesn't need to inspect it
  };
}

async function handleInvokeMaya(runId: number, slideNumber: SlideNumber) {
  const run = await getSlideFactoryRunById(runId);
  if (!run) return { error: `Run ${runId} not found` };

  const cacheKey = `${runId}:${slideNumber}`;
  const payloadV2 = dispatchedPayloads.get(cacheKey) ?? null;
  dispatchedPayloads.delete(cacheKey);

  if (!payloadV2) {
    return { error: `payloadV2 unavailable for slide ${slideNumber} — dispatch_slide_team must be called first` };
  }

  const luccaDraft = run.luccaDraft ?? {};
  const slidePrefix = `slide${slideNumber}.`;
  const slotDrafts = Object.fromEntries(
    Object.entries(luccaDraft).filter(([k]) => k.startsWith(slidePrefix)),
  );

  const output = await runMaya(slideNumber, payloadV2, slotDrafts as Record<string, LuccaSlotDraft>);
  return {
    verdict: output.verdict,
    headline: output.headline,
    notes: output.notes,
  };
}

async function handleInvokeDino(_runId: number, slideNumber: SlideNumber) {
  const canonicalPngKey = CANONICAL_ASSETS.slide(slideNumber, "png");
  const output = await runDino(slideNumber, canonicalPngKey);
  return {
    pixelDiffPct: output.pixelDiffPct,
    exceedsThreshold: output.exceedsThreshold,
    threshold: output.threshold,
  };
}

async function handleUpdateAgentResult(
  runId: number,
  slideNumber: SlideNumber,
  teamStatus: SlideTeamOutput["status"],
  mayaVerdict: MayaVerdictLevel,
  mayaHeadline: string | null,
  mayaNotes: string | null,
  dinoPixelDiffPct: number,
  dinoExceedsThreshold: boolean,
) {
  // Deterministic approval gate — Marco is a pass-through, not the decision maker
  const approved =
    teamStatus === "ok" &&
    (mayaVerdict === "ok" || mayaVerdict === "advisory") &&
    !dinoExceedsThreshold;

  const computedStatus: SlideAgentResult["status"] = approved ? "approved" : "rejected";

  const errorParts: string[] = [];
  if (teamStatus !== "ok") errorParts.push(`team=${teamStatus}`);
  if (mayaVerdict === "warning" || mayaVerdict === "block") {
    errorParts.push(`maya=${mayaVerdict}: ${mayaHeadline ?? ""}`);
  }
  if (dinoExceedsThreshold) {
    errorParts.push(`dino=${dinoPixelDiffPct.toFixed(1)}% > threshold`);
  }

  const result: SlideAgentResult = {
    status: computedStatus,
    pixelDiffPct: dinoPixelDiffPct,
    mayaVerdict,
    mayaNotes: mayaNotes ?? mayaHeadline ?? null,
    approvedAt: computedStatus === "approved" ? new Date().toISOString() : null,
    errorMessage: errorParts.length > 0 ? errorParts.join("; ") : null,
  };

  const updated = await updateAgentResult(runId, slideNumber, result);
  if (!updated) return { error: `Run ${runId} not found` };
  return { ok: true, slideNumber, computedStatus, written: result };
}

async function handleTransitionStatus(runId: number, newStatus: "complete" | "error") {
  // Server-side gate: if the LLM asks for 'complete' but any slide is rejected,
  // downgrade to 'error'. agentResults is the source of truth.
  let effectiveStatus: "complete" | "error" = newStatus;
  let downgradedFrom: "complete" | null = null;
  if (newStatus === "complete") {
    const run = await getSlideFactoryRunById(runId);
    if (!run) return { error: `Run ${runId} not found` };
    const results = run.agentResults ?? {};
    const anyRejected = Object.values(results).some((r) => r.status === "rejected");
    if (anyRejected) {
      effectiveStatus = "error";
      downgradedFrom = "complete";
    }
  }
  const patch =
    effectiveStatus === "complete"
      ? { status: "complete" as const, completedAt: new Date() }
      : { status: "error" as const };
  const updated = await updateSlideFactoryRun(runId, patch);
  if (!updated) return { error: `Run ${runId} not found` };
  return downgradedFrom
    ? { ok: true, status: updated.status, downgradedFrom }
    : { ok: true, status: updated.status };
}

// ── Argument coercers ────────────────────────────────────────────────────────

function asNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(`Expected number, got ${typeof v}: ${JSON.stringify(v)}`);
}

function asSlideNumber(v: unknown): SlideNumber {
  const n = asNumber(v);
  if (n >= SLIDE_NUMBER_MIN && n <= TOTAL_SLIDES && Number.isInteger(n)) {
    return n as SlideNumber;
  }
  throw new Error(`Expected ${SLIDE_NUMBER_RANGE_DESC}, got ${v}`);
}

/** Remove all cached payloadV2 entries for a run — called by markRunError to prevent leaks. */
export function clearRunPayloads(runId: number): void {
  for (const key of dispatchedPayloads.keys()) {
    if (key.startsWith(`${runId}:`)) dispatchedPayloads.delete(key);
  }
}

function asBoolean(v: unknown): boolean {
  if (v === true || v === false) return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0" || v === null || v === undefined) return false;
  throw new Error(`Expected boolean, got ${typeof v}: ${JSON.stringify(v)}`);
}

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new Error(`Expected one of [${allowed.join(", ")}], got ${JSON.stringify(v)}`);
}
