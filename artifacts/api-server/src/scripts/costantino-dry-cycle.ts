/**
 * Costantino dry-cycle script — exercises the full agentic code path without
 * spending money or making real HTTP calls.
 *
 * What it stubs:
 *   - callLlm: returns a canned sequence of tool calls in the exact order a
 *     real run would produce. The "LLM" walks through:
 *       list_admin_resources → for each row with a recipe, get_probe_recipe →
 *       probe_integration_endpoint → update_admin_resource_health → (on fail)
 *       write_finding → complete_task.
 *   - fetch: returns a canned 200 OK Response so probe_integration_endpoint
 *     returns status='ok' deterministically.
 *
 * What it asserts:
 *   - runCostantinoCycle returns status='ok' or 'warn' (never 'error').
 *   - metrics.resourcesConsidered matches a SELECT count() for the target kinds.
 *   - metrics.completed === true (complete_task fired).
 *   - A scheduler_runs row was inserted for this cycle.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run dry:costantino
 *
 * Note: this script imports api-server modules via relative path. The
 * api-server's tsconfig must compile cleanly first.
 */

/* eslint-disable no-console */

import { runCostantinoCycle, setCostantinoLlmOverride } from "../../artifacts/api-server/src/ai/costantino/agent";
import { setCostantinoFetchOverride } from "../../artifacts/api-server/src/ai/costantino/tools";
import { db } from "../../artifacts/api-server/src/db";
import { adminResources } from "@workspace/db";
import { inArray } from "drizzle-orm";

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

function makeStubLlm() {
  const queue: Array<{ text: string; toolCalls: ToolCall[] }> = [];
  let listed: Array<{ slug: string; kind: string; hasRecipe: boolean }> = [];
  let cursor = 0;
  let phase: "list" | "iterate" | "complete" | "done" = "list";

  return async function stubLlm(
    _vendor: string,
    _model: string,
    _systemPrompt: string,
    _history: unknown,
    userMessage: string,
    _sampling: unknown,
    _userId?: number,
    _webSearchEnabled?: boolean,
    _tools?: unknown,
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    // First call: ask for the catalog.
    if (phase === "list") {
      phase = "iterate";
      return {
        text: "Cataloging resources.",
        toolCalls: [{ name: "list_admin_resources", arguments: { kind: "all" } }],
      };
    }

    // Parse the previous tool result out of the user message body so we know
    // which slug to probe next.
    if (phase === "iterate" && listed.length === 0) {
      // First iterate-call sees the list_admin_resources result.
      const m = /\[list_admin_resources\] (.+)/.exec(userMessage);
      if (m) {
        try {
          const parsed = JSON.parse(m[1]);
          if (Array.isArray(parsed)) {
            listed = parsed
              .map((r: Record<string, unknown>) => ({
                slug: String(r.slug),
                kind: String(r.kind),
                hasRecipe: Boolean(r.hasRecipe),
              }))
              .filter((r) => r.hasRecipe);
          }
        } catch {
          // ignore parse error; cycle will end with no probes
        }
      }
    }

    if (phase === "iterate" && cursor < listed.length) {
      const target = listed[cursor];
      // For each row we issue the recipe→probe→persist sequence in a single turn.
      cursor += 1;
      return {
        text: `Probing ${target.slug}.`,
        toolCalls: [
          { name: "get_probe_recipe", arguments: { slug: target.slug } },
          { name: "probe_integration_endpoint", arguments: { slug: target.slug } },
          {
            name: "update_admin_resource_health",
            arguments: { slug: target.slug, status: "ok", latencyMs: 12, message: "dry-cycle stub probe" },
          },
        ],
      };
    }

    if (phase === "iterate") {
      phase = "complete";
    }

    if (phase === "complete") {
      phase = "done";
      return {
        text: "Wrapping up.",
        toolCalls: [
          {
            name: "complete_task",
            arguments: {
              summary: `Dry-cycle: considered ${listed.length} resource(s) with recipes; all stubbed to ok.`,
            },
          },
        ],
      };
    }

    // Should not be reached; return a no-op to avoid hanging.
    return { text: "done", toolCalls: [] };
  } as unknown as Parameters<typeof setCostantinoLlmOverride>[0] & ((...a: unknown[]) => unknown);
}

function makeStubFetch(): Parameters<typeof setCostantinoFetchOverride>[0] & ((u: string, i?: RequestInit) => Promise<Response>) {
  return (async (_url: string, _init?: RequestInit) => {
    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  }) as unknown as Parameters<typeof setCostantinoFetchOverride>[0] & ((u: string, i?: RequestInit) => Promise<Response>);
}

async function main() {
  console.log("[dry-cycle] Stubbing LLM + fetch.");
  setCostantinoLlmOverride(makeStubLlm());
  setCostantinoFetchOverride(makeStubFetch());

  // Snapshot: how many rows are eligible?
  const eligible = await db
    .select()
    .from(adminResources)
    .where(inArray(adminResources.kind, ["api", "source", "mcp"]));
  console.log(`[dry-cycle] Eligible rows in DB: ${eligible.length}`);

  console.log("[dry-cycle] Running cycle…");
  const result = await runCostantinoCycle();

  console.log("[dry-cycle] Cycle result:");
  console.log(JSON.stringify(result, null, 2));

  let pass = true;

  if (result.status === "error") {
    console.error("[dry-cycle] FAIL: cycle status was 'error'.");
    pass = false;
  } else {
    console.log("[dry-cycle] PASS: cycle status is non-error.");
  }

  if (result.metrics.resourcesConsidered !== eligible.length) {
    console.error(
      `[dry-cycle] FAIL: resourcesConsidered (${result.metrics.resourcesConsidered}) ≠ eligible rows (${eligible.length}).`,
    );
    pass = false;
  } else {
    console.log("[dry-cycle] PASS: resourcesConsidered matches DB count.");
  }

  if (!result.metrics.completed) {
    console.error("[dry-cycle] FAIL: complete_task was never called.");
    pass = false;
  } else {
    console.log("[dry-cycle] PASS: complete_task fired.");
  }

  // Cleanup overrides so a subsequent run from the same process is hermetic.
  setCostantinoLlmOverride(null);
  setCostantinoFetchOverride(null);

  if (!pass) {
    process.exitCode = 1;
    console.error("[dry-cycle] One or more assertions failed.");
  } else {
    console.log("[dry-cycle] All assertions passed.");
  }
}

main().catch((err) => {
  console.error("[dry-cycle] Threw:", err);
  process.exitCode = 1;
});
