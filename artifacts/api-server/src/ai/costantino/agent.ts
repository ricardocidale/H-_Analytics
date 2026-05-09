/**
 * Costantino — the Data Custodian agent (Step 0).
 *
 * Periodic agentic loop: probes every external integration registered in
 * admin_resources (kinds api, source, mcp), persists probe outcomes,
 * opens findings on anomalies, and resolves findings whose underlying issue
 * has cleared.
 *
 * The orchestration model here is identical to Pietro's: a tool-calling LLM
 * reads the system prompt, selects a tool, the dispatcher executes it, the
 * result is fed back, and the loop continues until the LLM calls
 * `complete_task` or the round cap is hit.
 *
 * The LLM is resolved at call time via resolveLlmFor(COSTANTINO_LLM_SLOT)
 * — no model identifier is hardcoded here.
 *
 * Test seam: `setCostantinoLlmOverride()` lets the dry-cycle script swap in
 * a deterministic stub that returns a canned sequence of tool calls.
 */
import { resolveLlmFor } from "../llm-config-resolver";
import { callLlm } from "../../routes/chat";
import {
  getCostantinoTools,
  dispatchCostantinoTool,
  makeEmptyMetrics,
  type CostantinoCycleMetrics,
} from "./tools";
import {
  COSTANTINO_LLM_SLOT,
  DEFAULT_COSTANTINO_MAX_TOOL_ROUNDS,
  DEFAULT_COSTANTINO_TEMPERATURE,
  DEFAULT_COSTANTINO_MAX_OUTPUT_TOKENS,
} from "@shared/constants";
import { logger } from "../../logger";

// ---------------------------------------------------------------------------
// System prompt — the five-responsibility charter
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Costantino, the Data Custodian for H+ Analytics. Your single job is to keep the integration layer trustworthy by running periodic health audits and recording what you find.

You operate as an autonomous tool-calling agent. Each cycle you have one job: audit the integrations registered in admin_resources (kinds: api, source, mcp), persist what you observe, and open or close findings as warranted.

## Your five responsibilities

1. **Catalog** — Call list_admin_resources first to see what exists and what state each row is in (lastHealthStatus, lastCheckedAt, hasRecipe).

2. **Probe** — For each row that has a healthProbe recipe (hasRecipe=true), call get_probe_recipe to read it, then probe_integration_endpoint to execute it. Skip rows without recipes — but open a 'missing_recipe' finding for any kind=api row that lacks one (api rows must be probable).

3. **Persist** — After every probe, call update_admin_resource_health with the outcome. This is the canonical write — never skip it, never invent a status without probing.

4. **Open findings** — When a probe fails or degrades, write a finding (kind=probe_failed). Use severity:
   - 'critical' for kind=api or kind=source rows that are completely broken (will block downstream consumers).
   - 'error' for kind=mcp rows or anything else that is broken but not blocking.
   - 'warn' for degraded responses (wrong status code, slow, partial).
   - 'info' for purely informational observations.
   Always populate the evidence object with the actual probe result.

Finally, **Resolve findings** — Call list_findings (scope='open') to read the open backlog. For any open finding whose target you just probed successfully ('ok'), call resolve_finding with a short note like "auto-resolved: probe returned ok at <time>".

## Rules

- **Always end the cycle with complete_task.** This writes your cycle summary and signals the loop to stop. Never end without it.
- **Never invent data.** Every health write must trace back to a real probe in this same cycle.
- **Probe each row at most once per cycle.** Once you have an outcome, persist it and move on.
- **Stay within scope.** You audit the integration layer. You do not modify recipes, do not add admin_resources rows, do not call any tool not on your list.
- **One tool per turn.** Pick the next most useful tool and call it. Read the response. Then pick the next one.

## Cycle summary format

When you call complete_task, your summary should report:
- Resources considered (count by kind)
- Probes run (ok / degraded / fail counts)
- Findings opened (with severities)
- Findings resolved
- Anything notable an admin should look at first
`;

// ---------------------------------------------------------------------------
// Test seam — dry-cycle script swaps in a deterministic stub
// ---------------------------------------------------------------------------

type LlmCallSig = typeof callLlm;
let llmOverride: LlmCallSig | null = null;

/** Test-only seam: replace the LLM call used by runCostantinoCycle. */
export function setCostantinoLlmOverride(fn: LlmCallSig | null): void {
  llmOverride = fn;
}

// ---------------------------------------------------------------------------
// Cycle runner
// ---------------------------------------------------------------------------

export interface CostantinoCycleResult {
  metrics: CostantinoCycleMetrics;
  rounds: number;
  status: "ok" | "warn" | "error";
  notes: string;
  durationMs: number;
}

export async function runCostantinoCycle(): Promise<CostantinoCycleResult> {
  const t0 = Date.now();
  const metrics = makeEmptyMetrics();
  const tools = getCostantinoTools();
  let rounds = 0;
  let status: CostantinoCycleResult["status"] = "ok";
  const errors: string[] = [];

  let llm: { vendor: string; modelId: string };
  try {
    const resolved = await resolveLlmFor(COSTANTINO_LLM_SLOT);
    llm = { vendor: resolved.vendor, modelId: resolved.modelId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[costantino] LLM resolution failed: ${msg}`);
    return {
      metrics,
      rounds: 0,
      status: "error",
      notes: `LLM resolution failed: ${msg}`,
      durationMs: Date.now() - t0,
    };
  }

  const callImpl: LlmCallSig = llmOverride ?? callLlm;
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let nextUserMessage = "Begin the audit cycle. Start with list_admin_resources.";

  while (rounds < DEFAULT_COSTANTINO_MAX_TOOL_ROUNDS) {
    rounds += 1;
    let llmResult;
    try {
      llmResult = await callImpl(
        llm.vendor,
        llm.modelId,
        SYSTEM_PROMPT,
        history,
        nextUserMessage,
        {
          temperature: DEFAULT_COSTANTINO_TEMPERATURE,
          maxOutputTokens: DEFAULT_COSTANTINO_MAX_OUTPUT_TOKENS,
        },
        undefined,
        false,
        tools,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`LLM call failed at round ${rounds}: ${msg}`);
      status = "error";
      break;
    }

    history.push({ role: "user", content: nextUserMessage });
    const assistantText =
      typeof (llmResult as { text?: string }).text === "string"
        ? (llmResult as { text?: string }).text!
        : "";

    const toolCalls = (llmResult as { toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }> })
      .toolCalls ?? [];

    if (toolCalls.length === 0) {
      // LLM responded with prose only — treat as end-of-cycle with a warning if
      // complete_task was never called.
      history.push({ role: "assistant", content: assistantText });
      if (!metrics.completed) {
        status = "warn";
        errors.push("LLM ended without calling complete_task");
      }
      break;
    }

    history.push({
      role: "assistant",
      content: assistantText || `[tool_calls: ${toolCalls.map(c => c.name).join(", ")}]`,
    });

    const toolResults: string[] = [];
    let cycleEnded = false;
    for (const call of toolCalls) {
      let result: unknown;
      try {
        result = await dispatchCostantinoTool(call.name, call.arguments ?? {}, metrics);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result = { error: `Tool dispatch threw: ${msg}` };
        errors.push(`Tool ${call.name} threw at round ${rounds}: ${msg}`);
      }
      toolResults.push(`[${call.name}] ${JSON.stringify(result)}`);
      if (call.name === "complete_task") cycleEnded = true;
    }

    if (cycleEnded) break;
    nextUserMessage = toolResults.join("\n\n");
  }

  if (rounds >= DEFAULT_COSTANTINO_MAX_TOOL_ROUNDS && !metrics.completed) {
    status = "warn";
    errors.push(`Hit max tool rounds (${DEFAULT_COSTANTINO_MAX_TOOL_ROUNDS}) without complete_task`);
  }

  if (metrics.probesFailed > 0 && status === "ok") status = "warn";

  return {
    metrics,
    rounds,
    status,
    notes: errors.length > 0
      ? errors.join(" | ")
      : `${metrics.resourcesConsidered} resources, ${metrics.probesOk}/${metrics.probesDegraded}/${metrics.probesFailed} probes ok/degraded/fail, ${metrics.findingsOpened} findings opened, ${metrics.findingsResolved} resolved`,
    durationMs: Date.now() - t0,
  };
}
