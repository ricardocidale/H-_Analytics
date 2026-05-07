/**
 * Marco's primitive tools — Unit 1.
 *
 * Marco is the slide factory orchestrator. Its tools are atomic primitives,
 * not bundled workflows: each tool does one thing, returns rich data, and
 * encodes no decision logic. Marco's system prompt drives sequencing.
 *
 * Tools:
 *   read_run             → fetch run state (status + slot drafts + assignments)
 *   dispatch_slide_team  → invoke per-slide team via U4 swarm dispatcher
 *   update_agent_result  → write one slide's verdict to agentResults JSONB
 *   transition_status    → move the run to 'complete' or 'error'
 *   complete_task        → exit signal for the bounded tool loop
 *
 * Maya verdict + Dino pixel-diff tools are added in U7. Phase 1 Marco
 * approves a slide on the team's own Inspector verdict; cross-app
 * verification layers on top later.
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
import { teamOutputToAgentStatus } from "./swarms/types";
import { CANONICAL_ASSETS } from "./canonical-assets";
import { TOTAL_SLIDES } from "./deck-render-constants";

const SLIDE_NUMBER_RANGE_DESC = `Slide number in 1..${TOTAL_SLIDES}`;
const SLIDE_NUMBER_MIN = 1;

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
      `Dispatch the per-slide swarm team for one slide (Sofia=slide ${SLIDE_NUMBER_MIN}, then Bianca, Chiara, Dario, Elisa, Felix in order through slide ${TOTAL_SLIDES}). Returns the team's SlideTeamOutput { status, payloadV2, notes }.`,
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
      "Write one slide's verdict to agentResults JSONB. Use status='approved' when the team returned ok, 'rejected' when block/fail/throw. Pass errorMessage when rejected.",
    input_schema: {
      type: "object",
      required: ["runId", "slideNumber", "status"],
      properties: {
        runId: { type: "number", description: "Slide factory run id" },
        slideNumber: {
          type: "integer",
          minimum: SLIDE_NUMBER_MIN,
          maximum: TOTAL_SLIDES,
          description: SLIDE_NUMBER_RANGE_DESC,
        },
        status: {
          type: "string",
          enum: ["approved", "rejected"],
          description: "Final per-slide verdict",
        },
        errorMessage: {
          type: ["string", "null"],
          description: "Required when status='rejected'; null when 'approved'",
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

      case "update_agent_result":
        return {
          result: await handleUpdateAgentResult(
            asNumber(args.runId),
            asSlideNumber(args.slideNumber),
            args.status as SlideAgentResult["status"],
            (args.errorMessage as string | null | undefined) ?? null,
          ),
        };

      case "transition_status":
        return {
          result: await handleTransitionStatus(
            asNumber(args.runId),
            args.newStatus as "complete" | "error",
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
    // financialInputs will flow from Davide via the route handler in U5/U6.
    // Phase 1 stub teams ignore this field; passing null makes the absence
    // explicit rather than silently undefined.
    financialInputs: null,
    canonicalPngKey: CANONICAL_ASSETS.slide(slideNumber, "png"),
    briefR2Key: run.briefR2Key,
  };

  const output: SlideTeamOutput = await dispatchSlideTeam(input);
  return {
    slideNumber: output.slideNumber,
    status: output.status,
    notes: output.notes,
    // Don't echo payloadV2 to the LLM — it's large and Marco doesn't need
    // to inspect it. Marco only needs to know whether the team succeeded.
  };
}

async function handleUpdateAgentResult(
  runId: number,
  slideNumber: SlideNumber,
  status: SlideAgentResult["status"],
  errorMessage: string | null,
) {
  const result: SlideAgentResult = {
    status,
    pixelDiffPct: null,   // populated by Dino in U7
    mayaVerdict: null,     // populated by Maya in U7
    mayaNotes: null,       // populated by Maya in U7
    approvedAt: status === "approved" ? new Date().toISOString() : null,
    errorMessage,
  };

  const updated = await updateAgentResult(runId, slideNumber, result);
  if (!updated) return { error: `Run ${runId} not found` };
  return { ok: true, slideNumber, written: result };
}

async function handleTransitionStatus(runId: number, newStatus: "complete" | "error") {
  const patch =
    newStatus === "complete"
      ? { status: "complete" as const, completedAt: new Date() }
      : { status: "error" as const };
  const updated = await updateSlideFactoryRun(runId, patch);
  if (!updated) return { error: `Run ${runId} not found` };
  return { ok: true, status: updated.status };
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

// Re-export for tests
export { teamOutputToAgentStatus };
