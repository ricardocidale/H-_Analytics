/**
 * Marco — slide factory orchestrator agent (Unit 1 + Unit 7).
 *
 * Status flow: building → complete (or error).
 *
 * Marco is a thin LLM-driven orchestrator. Its primitive tools encode no
 * decision logic — Marco's system prompt drives sequencing. Approval
 * computation lives entirely in handleUpdateAgentResult (deterministic).
 *
 * Per-slide sequence (Units 1 + 7):
 *   dispatch_slide_team → invoke_maya → invoke_dino → update_agent_result
 *
 * The route handler at routes/slide-factory.ts calls runMarco(runId) as
 * fire-and-forget after transitioning status to 'building'.
 */
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../logger";
import { getAnthropicClient } from "../ai/clients";
import { getSlideFactoryRunById, updateSlideFactoryRun } from "../storage/slide-factory-runs";
import {
  MARCO_MODEL,
  MARCO_MAX_TOKENS,
  MARCO_MAX_TOOL_DEPTH,
  TOTAL_SLIDES,
} from "./deck-render-constants";
import { MARCO_TOOLS, dispatchMarcoTool, clearRunPayloads } from "./marco-tools";

const MARCO_SYSTEM_PROMPT = `You are Marco, the slide factory orchestrator.

Your job: take a slide_factory_runs row in 'building' status and drive it to 'complete' (or 'error' if any per-slide team is rejected).

You have these primitive tools:
  read_run(runId)                                      — fetch run state
  dispatch_slide_team(runId, slideNumber)              — invoke the swarm team for slide 1..${TOTAL_SLIDES}
  invoke_maya(runId, slideNumber)                      — run cross-app content judge for one slide
  invoke_dino(runId, slideNumber)                      — run pixel-diff agent for one slide
  update_agent_result(runId, slideNumber, teamStatus, mayaVerdict, mayaHeadline, mayaNotes, dinoPixelDiffPct, dinoExceedsThreshold)
                                                       — write verdict (handler decides approved/rejected)
  transition_status(runId, newStatus)                  — move run to 'complete' or 'error'
  complete_task(summary)                               — exit signal (always call last)

Sequence (sequential; do not skip steps):
  - First, read_run to confirm status='building' and inspect property assignments.
  - Then for each slide from slide 1 through slide ${TOTAL_SLIDES}, in order:
       a. dispatch_slide_team(runId, slideNumber) — note the returned status and notes.
          If the result contains an "error" field, treat teamStatus as "fail" and notes as the error message.
       b. invoke_maya(runId, slideNumber) — note the returned verdict, headline, and notes.
          If the result contains an "error" field, pass mayaVerdict="block" and mayaNotes as the error message.
       c. invoke_dino(runId, slideNumber) — note the returned pixelDiffPct and exceedsThreshold.
          If the result contains an "error" field, pass dinoPixelDiffPct=0 and dinoExceedsThreshold=false.
       d. update_agent_result with all raw signals from steps a–c passed through exactly as returned.
          The tool returns computedStatus ('approved' or 'rejected') — use that to track rejections.
       e. Continue to the next slide regardless — do not stop on the first rejection.
  - After every slide has agentResults written:
       — If every slide's computedStatus was 'approved': transition_status(runId, 'complete').
       — If any slide's computedStatus was 'rejected': transition_status(runId, 'error').
  - Finally, complete_task with a one-sentence summary.

Constraints:
  • Do not invent slide numbers outside 1..${TOTAL_SLIDES}.
  • Do not call dispatch_slide_team, invoke_maya, or invoke_dino more than once per slide.
  • Do not interpret or modify the raw signals — pass them through to update_agent_result as-is.
  • Do not transition_status until every slide has been written.
  • Do not call any tool other than the seven listed above.`;

/**
 * Run Marco for one slide_factory_run.
 *
 * Caller is responsible for having transitioned the run's status to
 * 'building' before invoking. On unrecoverable failure (LLM error, depth
 * exceeded), Marco sets status='error' as a best-effort terminal state.
 */
export async function runMarco(runId: number): Promise<void> {
  let anthropic: Anthropic;
  try {
    anthropic = getAnthropicClient();
  } catch (err: unknown) {
    logger.error(`[marco] run ${runId} — Anthropic client unavailable: ${String(err)}`, "slide-factory");
    await markRunError(runId);
    return;
  }

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Build the slide deck for run ${runId}. Begin by reading the run, then dispatch each slide team in turn. Call complete_task when finished.`,
    },
  ];

  let depth = 0;
  let completedSummary: string | null = null;

  try {
    while (depth < MARCO_MAX_TOOL_DEPTH) {
      depth += 1;

      const response = await anthropic.messages.create({
        model: MARCO_MODEL,
        max_tokens: MARCO_MAX_TOKENS,
        system: MARCO_SYSTEM_PROMPT,
        tools: MARCO_TOOLS,
        messages,
      });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      // Append assistant turn verbatim so the next user turn references real ids
      messages.push({ role: "assistant", content: response.content });

      if (toolUses.length === 0) {
        // No tool_use — Marco ended its turn without finishing. Treat as failure.
        logger.warn(
          `[marco] run ${runId} — assistant ended turn without tool_use at depth ${depth}; stop_reason=${response.stop_reason}`,
          "slide-factory",
        );
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const out = await dispatchMarcoTool(
          tu.name,
          (tu.input ?? {}) as Record<string, unknown>,
          { runId },
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(out.result),
        });
        if (out.finalSummary !== undefined) {
          completedSummary = out.finalSummary;
        }
      }

      messages.push({ role: "user", content: toolResults });

      if (completedSummary !== null) break;
    }

    if (completedSummary === null) {
      logger.error(
        `[marco] run ${runId} — exceeded MARCO_MAX_TOOL_DEPTH (${MARCO_MAX_TOOL_DEPTH}) without completing`,
        "slide-factory",
      );
      await markRunError(runId);
      return;
    }

    // Stuck-state guard: complete_task fired but the LLM forgot to call
    // transition_status first. Without this, the run sits at 'building'
    // forever and the polling UI spins. Force terminal state.
    const finalRun = await getSlideFactoryRunById(runId);
    if (finalRun && finalRun.status === "building") {
      logger.warn(
        `[marco] run ${runId} — complete_task fired without transition_status; forcing error`,
        "slide-factory",
      );
      await markRunError(runId);
      return;
    }

    logger.info(`[marco] run ${runId} complete — ${completedSummary}`, "slide-factory");
  } catch (err: unknown) {
    logger.error(`[marco] run ${runId} failed: ${String(err)}`, "slide-factory");
    await markRunError(runId);
  }
}

async function markRunError(runId: number): Promise<void> {
  clearRunPayloads(runId);
  try {
    await updateSlideFactoryRun(runId, { status: "error" });
  } catch {
    // best-effort
  }
}
