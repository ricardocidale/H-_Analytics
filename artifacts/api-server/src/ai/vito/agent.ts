/**
 * Vito compliance audit agent executor.
 *
 * Vito scans the codebase for violations of the platform's three compliance
 * contracts (constants taxonomy, admin_resources parity, KB coverage) and
 * optionally a fourth pass (integration identifiers in source, full mode only).
 * Results are written to compliance_violations via the write_violation tool.
 */
import { callLlm } from "../../routes/chat";
import { resolveLlmFor } from "../llm-config-resolver";
import { getVitoTools, dispatchVitoTool } from "./tools";
import { createVitoRun, finalizeVitoRun } from "./workspace";
import type { ToolCall } from "../../chat/tool-types";
import { log as serverLog } from "../../logger";

// ---------------------------------------------------------------------------
// Named constants (no numeric literals outside these declarations)
// ---------------------------------------------------------------------------

/** Maximum tool-call iterations per run before forcing end_turn. */
const VITO_MAX_TOOL_DEPTH = 20;

/** Low temperature — Vito makes deterministic classification decisions. */
const VITO_TEMPERATURE = 0.1;

/** Token budget per run. */
const VITO_MAX_OUTPUT_TOKENS = 4_000;

/** Logger source tag. */
const SOURCE = "vito-compliance-agent";

/** Max characters of final summary to store in vito_runs.notes. */
const VITO_NOTES_MAX_CHARS = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VitoTrigger = "scheduled-audit" | "manual" | "manual-full";

export interface VitoRunResult {
  runId: number;
  trigger: VitoTrigger;
  passesCompleted: number;
  blockCount: number;
  warningCount: number;
  advisoryCount: number;
  infoCount: number;
  status: "ok" | "warn" | "error";
}

type MessageEntry = { role: string; content: unknown; [key: string]: unknown };

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const VITO_SYSTEM_PROMPT = `You are Vito, H+ Analytics' compliance audit agent. Your job is to scan the codebase for violations of the platform's three compliance contracts and report them — you do NOT fix code.

Run three passes in this exact order:

PASS 1 — Constants taxonomy (always run):
- Call scan_lib_constants() to find DEFAULT_* constants defined outside canonical constants files
- Call list_admin_resources("parameter") to check if behavioral constants have DB rows
- Write warning/advisory violations for taxonomy misclassifications

PASS 2 — admin_resources parity (always run):
- Call list_admin_resources() to get all rows
- Call list_resolver_call_sites() to see what code actually requests
- Cross-reference: flag llm_slot or parameter rows with no matching resolver call (advisory: orphaned config)
- Flag resolver calls with no matching admin_resources row (advisory: missing config)
- Write advisory violations

PASS 3 — KB coverage (always run):
- Call list_kb_entry_domains() to see what domains are indexed
- Call scan_lib_constants(["DEFAULT_ADR", "DEFAULT_CAP_RATE", "DEFAULT_OCC", "BENCHMARK"]) to find financial domain constants
- Write info violations for financial benchmarks in code with no KB entry

PASS 4 — Integration identifiers (FULL MODE ONLY — skip if mode is "runtime"):
- Call scan_agent_source_files(["claude-", "gpt-", "gemini-", "sonar", "IRIS_", "PIETRO_", "MARCO_"]) to find model/API string literals
- If result is { unavailable: true }, note "source files unavailable in runtime mode" and skip
- Write block violations for any model name string literals found

Rules:
- Use write_violation for every finding. Never suggest code fixes inline.
- Severity: block=integration identifier in source, warning=magic number/wrong-file constant, advisory=admin_resources drift, info=KB gap
- A string that matches an admin_resources slug (kind="llm_slot" or "model") is NOT a violation
- Be brief and factual in descriptions
- Complete all applicable passes even if earlier ones find violations`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appendVitoToolResults(
  history: MessageEntry[],
  toolCalls: ToolCall[],
  results: Array<{ id: string; name: string; result: unknown }>,
): MessageEntry[] {
  return [
    ...history,
    {
      role: "assistant",
      content: toolCalls.map((tc) => ({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: tc.arguments,
      })),
    },
    {
      role: "user",
      content: results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.id,
        content: JSON.stringify(r.result),
      })),
    },
  ];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runVitoAgent(trigger: VitoTrigger, preCreatedRunId?: number): Promise<VitoRunResult> {
  const startTime = Date.now();
  const mode = trigger === "manual-full" ? "full" : "runtime";

  const runId = preCreatedRunId ?? await createVitoRun(trigger, mode);

  const tools = getVitoTools();
  const sampling = { temperature: VITO_TEMPERATURE, maxOutputTokens: VITO_MAX_OUTPUT_TOKENS };

  const userKickoff = `Trigger: ${trigger}\nMode: ${mode}\n\nBegin the compliance audit now. Run all applicable passes.`;
  let history: MessageEntry[] = [{ role: "user", content: userKickoff }];
  let finalText = "";
  let runError: unknown = undefined;

  // Track violation counts and tool invocations as the agent writes them
  const counts = { block: 0, warning: 0, advisory: 0, info: 0 };
  const toolsInvoked: string[] = [];

  try {
    // Resolve model inside the try/catch so a missing slot finalizes the run
    // row (when preCreatedRunId was passed) instead of leaving it stranded.
    const resolved = await resolveLlmFor("vito-compliance-audit");
    const { vendor, modelId } = resolved;

    serverLog(`Starting run ${runId} (trigger=${trigger}, mode=${mode}, model=${modelId})`, SOURCE);
    for (let depth = 0; depth < VITO_MAX_TOOL_DEPTH; depth++) {
      const isLastDepth = depth === VITO_MAX_TOOL_DEPTH - 1;
      const activeTools = isLastDepth ? [] : tools;

      const result = await callLlm(
        vendor,
        modelId,
        VITO_SYSTEM_PROMPT,
        depth === 0 ? [] : history,
        depth === 0 ? userKickoff : "",
        sampling,
        undefined,
        undefined,
        activeTools.length > 0 ? activeTools : undefined,
      );

      if (!result.toolCalls?.length || result.stopReason === "end_turn") {
        finalText = result.text;
        break;
      }

      if (depth === 0) {
        history = [{ role: "user", content: userKickoff }];
      }

      const toolResults: Array<{ id: string; name: string; result: unknown }> = [];
      for (const tc of result.toolCalls) {
        toolsInvoked.push(tc.name);
        const toolResult = await dispatchVitoTool(runId, tc.name, tc.arguments ?? {});

        // Track violation counts from write_violation calls
        if (
          tc.name === "write_violation" &&
          tc.arguments &&
          typeof tc.arguments === "object"
        ) {
          const severity = (tc.arguments as Record<string, unknown>).severity as string;
          if (severity === "block") counts.block++;
          else if (severity === "warning") counts.warning++;
          else if (severity === "advisory") counts.advisory++;
          else if (severity === "info") counts.info++;
        }

        toolResults.push({ id: tc.id, name: tc.name, result: toolResult });
      }

      history = appendVitoToolResults(history, result.toolCalls, toolResults);
    }
  } catch (err: unknown) {
    runError = err;
    const msg = err instanceof Error ? err.message : "Run failed with unexpected error";
    serverLog(`Run ${runId} failed: ${msg}`, SOURCE, "error");
    if (!finalText) finalText = msg;
    // If the caller pre-created the run row, finalize it so it doesn't stay
    // stuck in the initial state (e.g. when resolveLlmFor throws).
    if (preCreatedRunId !== undefined) {
      await finalizeVitoRun(preCreatedRunId, {
        passesCompleted: 0, blockCount: 0, warningCount: 0,
        advisoryCount: 0, infoCount: 0,
        status: "error",
        notes: msg.slice(0, VITO_NOTES_MAX_CHARS),
        durationMs: Date.now() - startTime,
      }).catch(() => {});
      throw err;
    }
  }

  const durationMs = Date.now() - startTime;
  const totalViolations = counts.block + counts.warning + counts.advisory + counts.info;
  const status: "ok" | "warn" | "error" =
    runError !== undefined
      ? "error"
      : totalViolations > 0
        ? "warn"
        : "ok";

  // Infer passes from distinct anchor tool types invoked (each pass has a
  // distinct anchor call). Using Set membership prevents a revisited anchor
  // from counting as an extra pass.
  const invokedSet = new Set(toolsInvoked);
  const runtimeAnchors = ["scan_lib_constants", "list_resolver_call_sites", "list_kb_entry_domains"];
  const fullAnchors = [...runtimeAnchors, "scan_agent_source_files"];
  const passesCompleted = invokedSet.size > 0
    ? (mode === "full" ? fullAnchors : runtimeAnchors).filter(a => invokedSet.has(a)).length
    : 0;

  await finalizeVitoRun(runId, {
    passesCompleted,
    blockCount: counts.block,
    warningCount: counts.warning,
    advisoryCount: counts.advisory,
    infoCount: counts.info,
    status,
    notes: finalText ? finalText.slice(0, VITO_NOTES_MAX_CHARS) : undefined,
    durationMs,
  }).catch((err: unknown) => {
    serverLog(
      `Failed to finalize run ${runId}: ${err instanceof Error ? err.message : String(err)}`,
      SOURCE,
      "error",
    );
  });

  serverLog(
    `Run ${runId} complete — block=${counts.block} warning=${counts.warning} advisory=${counts.advisory} info=${counts.info} status=${status} durationMs=${durationMs}`,
    SOURCE,
  );

  if (runError !== undefined) throw runError;

  return {
    runId,
    trigger,
    passesCompleted,
    blockCount: counts.block,
    warningCount: counts.warning,
    advisoryCount: counts.advisory,
    infoCount: counts.info,
    status,
  };
}
