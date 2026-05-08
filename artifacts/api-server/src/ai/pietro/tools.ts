/**
 * Pietro tools — four operations Pietro calls during health/refresh runs.
 *
 * Exports:
 *   getPietroTools()      — JSON Schema tool definitions
 *   dispatchPietroTool()  — routes tool names to implementations
 */
import { db } from "../../db";
import { adminResources } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { runProbe } from "../../jobs/probes";
import { writePietroHealth } from "./workspace";
import { MINION_REGISTRY } from "../ambient/pietro-scheduler";
import type { ToolParam } from "../../chat/tool-types";

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

/** Kinds that represent external data sources Pietro manages. */
const PIETRO_SOURCE_KINDS = ["source", "mcp"] as const;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export function getPietroTools(): ToolParam[] {
  return [
    {
      name: "list_data_sources",
      description:
        "List admin_resource rows managed by Pietro (kinds: source, mcp). " +
        "Pass filter='stale' to see only sources whose cached data (fetched_at) is beyond their kind TTL, " +
        "'failed' for sources whose last health check failed, or 'all' (default) for everything. " +
        "Pietro calls this FIRST on every run to discover which sources need attention.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["all", "stale", "failed"],
            description: "Which sources to return. Defaults to 'all'.",
          },
        },
        required: [],
      },
    },
    {
      name: "assess_source_health",
      description:
        "Run a live probe of a single admin_resource row (by slug). " +
        "Returns { status, latencyMs, errorCode?, errorMessage? }. " +
        "Use to verify connectivity and secret presence before dispatching a minion.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "The resource slug, e.g. 'fmp-reit'" },
        },
        required: ["slug"],
      },
    },
    {
      name: "dispatch_minion",
      description:
        "Call the registered minion for an admin_resource slug. " +
        "The minion fetches from the external source and upserts into the DB cache table. " +
        "Returns a MinionResult with rowsUpserted, rowsFailed, errors[], durationMs. " +
        "Only dispatch when assess_source_health confirms the secret is present.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "The resource slug, e.g. 'fmp-reit'" },
        },
        required: ["slug"],
      },
    },
    {
      name: "write_health_report",
      description:
        "Write Pietro's health summary to the workspace. ALWAYS call this as the last tool. " +
        "Include: sources checked, minions dispatched, rows upserted, errors encountered.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Full health report text to persist.",
          },
        },
        required: ["summary"],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function toolListDataSources(args: Record<string, unknown>) {
  const filter = (args.filter as string | undefined) ?? "all";

  const rows = await db
    .select()
    .from(adminResources)
    .where(or(...PIETRO_SOURCE_KINDS.map(k => eq(adminResources.kind, k))));

  const mapped = rows.map(r => ({
    slug: r.slug,
    kind: r.kind,
    displayName: r.displayName,
    lastHealthStatus: r.lastHealthStatus,
    lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
    dailyRequestBudget: r.dailyRequestBudget ?? null,
    hasMinion: Boolean(MINION_REGISTRY[r.slug]),
  }));

  if (filter === "failed") {
    return mapped.filter(r => r.lastHealthStatus === "red");
  }
  if (filter === "stale") {
    return mapped.filter(r => r.lastHealthStatus === "amber" || r.lastHealthStatus === "gray");
  }
  return mapped;
}

async function toolAssessSourceHealth(args: Record<string, unknown>) {
  const slug = args.slug as string;
  const [row] = await db.select().from(adminResources).where(eq(adminResources.slug, slug)).limit(1);
  if (!row) return { error: `No resource found with slug: ${slug}` };
  return await runProbe(row);
}

async function toolDispatchMinion(args: Record<string, unknown>) {
  const slug = args.slug as string;
  const minion = MINION_REGISTRY[slug];
  if (!minion) return { error: `No minion registered for slug: ${slug}` };
  return await minion();
}

async function toolWriteHealthReport(args: Record<string, unknown>) {
  const summary = args.summary as string;
  const timestamp = new Date().toISOString();
  const content = `# Pietro Health Report\n\nGenerated: ${timestamp}\n\n${summary}`;
  await writePietroHealth(content);
  return { written: true };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function dispatchPietroTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_data_sources":   return toolListDataSources(args);
    case "assess_source_health": return toolAssessSourceHealth(args);
    case "dispatch_minion":      return toolDispatchMinion(args);
    case "write_health_report":  return toolWriteHealthReport(args);
    default:
      return { error: `Unknown Pietro tool: ${name}` };
  }
}
