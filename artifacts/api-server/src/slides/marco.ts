/**
 * Marco — slide factory orchestrator agent (Unit 1).
 *
 * Status flow: building → complete (or error).
 *
 * Marco is a thin LLM-driven orchestrator. Its primitive tools (read_run,
 * dispatch_slide_team, update_agent_result, transition_status, complete_task)
 * encode no decision logic — Marco's system prompt drives sequencing.
 *
 * Phase 1 scope:
 *   - dispatch each of six per-slide teams sequentially (Sofia, Bianca,
 *     Chiara, Dario, Elisa, Felix)
 *   - write each team's verdict to agentResults JSONB
 *   - transition the run to 'complete' (all approved) or 'error' (any rejected)
 *
 * Maya verdict + Dino pixel-diff integration is U7. Phase 1 Marco approves
 * a slide on the team's own Inspector verdict; cross-app verification
 * layers on top later by extending Marco's tool list and system prompt.
 *
 * The route handler at routes/slide-factory.ts:432 calls runMarco(runId) as
 * fire-and-forget after transitioning status to 'building' — same pattern
 * as runLorenzoIngestion / runLuccaDraft.
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
import { MARCO_TOOLS, dispatchMarcoTool } from "./marco-tools";

const MARCO_SYSTEM_PROMPT = `You are Marco, the slide factory orchestrator.

Your job: take a slide_factory_runs row in 'building' status and drive it to 'complete' (or 'error' if any per-slide team rejects).

You have these primitive tools:
  read_run(runId)                                — fetch run state
  dispatch_slide_team(runId, slideNumber)        — invoke the team for slide 1..${TOTAL_SLIDES}
  update_agent_result(runId, slideNumber, status, errorMessage?) — write verdict
  transition_status(runId, newStatus)            — move run to 'complete' or 'error'
  complete_task(summary)                         — exit signal (always call last)

Sequence (sequential; do not skip steps):
  - First, read_run to confirm status='building' and inspect property assignments.
  - Then for each slide from slide 1 through slide ${TOTAL_SLIDES}, in order:
       a. dispatch_slide_team(runId, slideNumber).
       b. If the team returns status='ok': update_agent_result with status='approved' and errorMessage=null.
          Otherwise (status='block' or 'fail', or the tool returned an error):
          update_agent_result with status='rejected' and errorMessage = the team's notes (or the error string).
       c. Continue to the next slide regardless — do not stop on the first rejection.
  - After every slide has agentResults written:
       — If every slide's status is 'approved': transition_status(runId, 'complete').
       — If any slide is 'rejected': transition_status(runId, 'error').
  - Finally, complete_task with a one-sentence summary.

Constraints:
  • Do not invent slide numbers outside 1..${TOTAL_SLIDES}.
  • Do not call dispatch_slide_team more than once per slide.
  • Do not transition_status until every slide has been written.
  • Do not call any tool other than the five listed above.`;

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
  try {
    await updateSlideFactoryRun(runId, { status: "error" });
  } catch {
    // best-effort
  }
}
