/**
 * Costantino tools — eight operations Costantino calls during a health-audit
 * cycle. Mirrors the Pietro tool/dispatcher shape (JSON-Schema parameters,
 * ToolParam type, switch-based dispatcher).
 *
 * Exports:
 *   getCostantinoTools()      — JSON Schema tool definitions
 *   dispatchCostantinoTool()  — routes tool names to implementations
 *   setCostantinoFetchOverride() — test-only seam for the dry-cycle script
 *
 * Tool roster:
 *   list_admin_resources        — catalog admin_resources rows by kind filter
 *   get_probe_recipe            — read healthProbe recipe from a row's config
 *   probe_integration_endpoint  — execute the recipe (HTTP fetch with timeout)
 *   update_admin_resource_health — record probe outcome via storage
 *   write_finding               — open a costantino_findings row
 *   list_findings               — read open/recent findings
 *   resolve_finding             — close a finding
 *   complete_task               — terminal tool; signals end of cycle
 */
import { db } from "../../db";
import { adminResources, costantinoFindings } from "@workspace/db";
import { eq, and, isNull, desc, inArray, sql } from "drizzle-orm";
import { storage } from "../../storage";
import { writeCostantinoHealth } from "./workspace";
import { validateIngestUrl } from "../iris/tools";
import { NATIONAL_FEED_QUARTERLY_TTL_DAYS } from "@shared/constants-research";
import {
  COSTANTINO_DEFAULT_EXPECTED_HTTP_STATUS,
  COSTANTINO_DEGRADED_HTTP_STATUS_MAX_EXCLUSIVE,
  COSTANTINO_DEGRADED_HTTP_STATUS_MIN,
  COSTANTINO_FINDINGS_PAGE_LIMIT,
  COSTANTINO_RECENT_FINDINGS_LIMIT,
  DEFAULT_COSTANTINO_PROBE_TIMEOUT_MS,
  HTTP_STATUS_CODE_MIN,
  HTTP_STATUS_CODE_MAX,
} from "@shared/constants";
import type { ToolParam } from "../../chat/tool-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Kinds Costantino is responsible for auditing. */
const COSTANTINO_TARGET_KINDS = ["api", "source", "mcp"] as const;

const FINDING_KINDS = [
  "probe_failed",
  "missing_recipe",
  "missing_secret",
  "schema_mismatch",
  "stale_feed",
  "unknown",
] as const;

const FINDING_SEVERITIES = ["info", "warn", "error", "critical"] as const;

/**
 * Costantino's tool-level status enum. The DB's ProbeStatus is
 * `"ok" | "fail" | "skipped"` — `degraded` is a Costantino-only band
 * that maps to `fail` at persist time (with the message preserved on
 * `resource_health_checks.errorMessage`).
 */
const PROBE_STATUSES = ["ok", "degraded", "fail"] as const;
type ProbeStatus = (typeof PROBE_STATUSES)[number];

/** DB ProbeStatus values that storage.recordProbeResult accepts. */
type DbProbeStatus = "ok" | "fail" | "skipped";

function toDbProbeStatus(s: ProbeStatus): DbProbeStatus {
  if (s === "ok") return "ok";
  // Both "degraded" and "fail" persist as "fail" — the message column on
  // resource_health_checks carries the human-readable distinction.
  return "fail";
}

// ---------------------------------------------------------------------------
// Test seams (dry-cycle script overrides these)
// ---------------------------------------------------------------------------

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
let fetchOverride: FetchFn | null = null;

/** Test-only seam: replace the fetch used by probe_integration_endpoint. */
export function setCostantinoFetchOverride(fn: FetchFn | null): void {
  fetchOverride = fn;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export function getCostantinoTools(): ToolParam[] {
  return [
    {
      name: "list_admin_resources",
      description:
        "List admin_resources rows Costantino is responsible for (kinds: api, source, mcp). " +
        "Optionally filter by kind. Returns slug, kind, displayName, lastHealthStatus, " +
        "lastCheckedAt, and whether config.healthProbe is present. " +
        "Costantino calls this FIRST every cycle to discover what to audit.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["api", "source", "mcp", "all"],
            description: "Filter by kind. Defaults to 'all' (returns all three).",
          },
        },
        required: [],
      },
    },
    {
      name: "get_probe_recipe",
      description:
        "Return the healthProbe recipe from an admin_resources row's config jsonb. " +
        "Recipe shape: { method, url, expectStatus?, headers?, secretRef? }. " +
        "Returns { recipe: null } if the row has no recipe — that itself is a finding " +
        "(call write_finding with kind='missing_recipe').",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "The resource slug." },
        },
        required: ["slug"],
      },
    },
    {
      name: "probe_integration_endpoint",
      description:
        "Execute a healthProbe recipe against its endpoint. Performs an HTTP fetch with a " +
        "timeout (default 15s) and returns { status: 'ok'|'degraded'|'fail', latencyMs, " +
        "httpStatus?, errorCode?, errorMessage? }. 'ok' = matching expectStatus; " +
        "'degraded' = 2xx/3xx but not the expected status; 'fail' = non-2xx, network error, " +
        "or timeout. Costantino calls update_admin_resource_health AFTER this to persist the outcome.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "The resource slug to probe." },
          timeoutMs: {
            type: "number",
            description: "Override the default 15s probe timeout. Optional.",
          },
        },
        required: ["slug"],
      },
    },
    {
      name: "update_admin_resource_health",
      description:
        "Persist a probe outcome to the database. Inserts a row into resource_health_checks " +
        "and updates the parent admin_resources row's lastHealthStatus + lastCheckedAt " +
        "atomically (single transaction). The 'message' parameter is stored on the probe row's " +
        "errorMessage column, not on the parent.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "The resource slug." },
          status: {
            type: "string",
            enum: ["ok", "degraded", "fail"],
            description: "Probe outcome status.",
          },
          latencyMs: { type: "number", description: "Round-trip duration in milliseconds." },
          message: {
            type: "string",
            description: "Optional human-readable note (error text or success summary).",
          },
        },
        required: ["slug", "status", "latencyMs"],
      },
    },
    {
      name: "write_finding",
      description:
        "Open a row in costantino_findings. Use for any anomaly that warrants admin attention: " +
        "probe failures, missing recipes, missing secrets, schema mismatches. " +
        "Severity guidance: 'info' (cosmetic), 'warn' (degraded but functional), " +
        "'error' (broken integration), 'critical' (blocks downstream consumers).",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["probe_failed", "missing_recipe", "missing_secret", "schema_mismatch", "unknown"],
          },
          severity: {
            type: "string",
            enum: ["info", "warn", "error", "critical"],
          },
          targetKind: {
            type: "string",
            description: "What entity the finding is about (usually 'admin_resource').",
          },
          targetId: {
            type: "string",
            description: "Identifier of the target — typically the admin_resource slug.",
          },
          description: {
            type: "string",
            description: "Single-paragraph explanation an admin can read and act on.",
          },
          evidence: {
            type: "object",
            description: "Free-form jsonb evidence: probe result, http status, error code, etc.",
          },
        },
        required: ["kind", "severity", "targetKind", "targetId", "description"],
      },
    },
    {
      name: "list_findings",
      description:
        "Read costantino_findings rows. Pass scope='open' (default — resolved_at IS NULL), " +
        `'recent' (last ${COSTANTINO_RECENT_FINDINGS_LIMIT} by detected_at), or 'all'.`,
      parameters: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["open", "recent", "all"] },
          targetId: {
            type: "string",
            description: "Optionally filter by target slug. Optional.",
          },
        },
        required: [],
      },
    },
    {
      name: "resolve_finding",
      description:
        "Close a finding. Sets resolved_at = now(). Call this when a previously-failing " +
        "integration probes 'ok' again or when the issue is otherwise no longer actionable.",
      parameters: {
        type: "object",
        properties: {
          findingId: { type: "string", description: "UUID of the finding to close." },
          note: {
            type: "string",
            description: "Optional resolution note appended to evidence.resolution.",
          },
        },
        required: ["findingId"],
      },
    },
    {
      name: "check_table_freshness",
      description:
        "Check whether a national benchmark feed table has been refreshed recently enough. " +
        "Accepts the admin_resource slug for one of the known national feed sources " +
        "('vendor-passthrough-costs' or 'mgmt-co-markup-factors'). Queries the DB for the " +
        "most recent fetched_at value in the corresponding table and compares it against the " +
        "row's config.freshnessProbe.thresholdDays. Returns { fresh, latestFetchedAt, " +
        "ageHours, thresholdDays }. Use this after probing a source row that has a " +
        "config.freshnessProbe — if fresh=false, open a stale_feed finding.",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "The admin_resource slug for the national feed source to check.",
            enum: ["vendor-passthrough-costs", "mgmt-co-markup-factors"],
          },
        },
        required: ["slug"],
      },
    },
    {
      name: "complete_task",
      description:
        "Terminal tool — ALWAYS call this last. Writes Costantino's cycle-summary report to " +
        "the workspace and signals the orchestration loop to stop calling tools. The summary " +
        "should list: rows audited, probes run (ok/degraded/fail counts), findings opened, " +
        "findings resolved.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Cycle-summary text." },
        },
        required: ["summary"],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Cycle metrics (returned to the scheduler so it can record the run)
// ---------------------------------------------------------------------------

export interface CostantinoCycleMetrics {
  resourcesConsidered: number;
  probesOk: number;
  probesDegraded: number;
  probesFailed: number;
  findingsOpened: number;
  findingsResolved: number;
  completed: boolean;
}

export function makeEmptyMetrics(): CostantinoCycleMetrics {
  return {
    resourcesConsidered: 0,
    probesOk: 0,
    probesDegraded: 0,
    probesFailed: 0,
    findingsOpened: 0,
    findingsResolved: 0,
    completed: false,
  };
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

interface HealthProbeRecipe {
  method?: string;
  url: string;
  expectStatus?: number;
  headers?: Record<string, string>;
  secretRef?: string;
}

function extractRecipe(config: unknown): HealthProbeRecipe | null {
  if (!config || typeof config !== "object") return null;
  const raw = (config as Record<string, unknown>).healthProbe;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.url !== "string") return null;
  return {
    method: typeof r.method === "string" ? r.method : "GET",
    url: r.url,
    expectStatus: (Number.isInteger(r.expectStatus) && Number.isFinite(r.expectStatus as number) && (r.expectStatus as number) >= HTTP_STATUS_CODE_MIN && (r.expectStatus as number) <= HTTP_STATUS_CODE_MAX)
      ? (r.expectStatus as number)
      : COSTANTINO_DEFAULT_EXPECTED_HTTP_STATUS,
    headers: (r.headers && typeof r.headers === "object") ? (r.headers as Record<string, string>) : undefined,
    secretRef: typeof r.secretRef === "string" ? r.secretRef : undefined,
  };
}

async function toolListAdminResources(args: Record<string, unknown>, metrics: CostantinoCycleMetrics) {
  const kindArg = (args.kind as string | undefined) ?? "all";
  const kinds = kindArg === "all" ? [...COSTANTINO_TARGET_KINDS] : [kindArg];

  const rows = await db
    .select()
    .from(adminResources)
    .where(inArray(adminResources.kind, kinds));

  metrics.resourcesConsidered = rows.length;

  return rows.map((r) => ({
    slug: r.slug,
    kind: r.kind,
    displayName: r.displayName,
    lastHealthStatus: r.lastHealthStatus,
    lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
    hasRecipe: extractRecipe(r.config) !== null,
  }));
}

async function toolGetProbeRecipe(args: Record<string, unknown>) {
  const slug = args.slug as string;
  const [row] = await db.select().from(adminResources).where(eq(adminResources.slug, slug)).limit(1);
  if (!row) return { error: `No resource found with slug: ${slug}` };
  const recipe = extractRecipe(row.config);
  return { slug, recipe };
}

async function toolProbeIntegrationEndpoint(args: Record<string, unknown>, metrics: CostantinoCycleMetrics) {
  const slug = args.slug as string;
  const timeoutMs = (args.timeoutMs as number | undefined) ?? DEFAULT_COSTANTINO_PROBE_TIMEOUT_MS;

  const [row] = await db.select().from(adminResources).where(eq(adminResources.slug, slug)).limit(1);
  if (!row) return { error: `No resource found with slug: ${slug}` };
  const recipe = extractRecipe(row.config);
  if (!recipe) return { error: `No healthProbe recipe in config for slug: ${slug}` };

  // SSRF guard — recipe.url originates from admin_resources.config (admin-editable in DB),
  // so it is a user-controlled ingress path. Route it through the canonical
  // validateIngestUrl() blocklist (non-http(s) schemes + private/internal host ranges)
  // before any outbound fetch. Per coding guidelines, every tool that accepts a
  // user-controlled URL must call validateIngestUrl() first.
  const urlError = validateIngestUrl(recipe.url);
  if (urlError) {
    metrics.probesFailed += 1;
    return { status: "fail" as ProbeStatus, latencyMs: 0, errorCode: "BLOCKED_URL", errorMessage: urlError };
  }

  const fetchImpl: FetchFn = fetchOverride ?? (globalThis.fetch.bind(globalThis));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetchImpl(recipe.url, {
      method: recipe.method ?? "GET",
      headers: recipe.headers,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - t0;
    const expected = recipe.expectStatus ?? COSTANTINO_DEFAULT_EXPECTED_HTTP_STATUS;
    let status: ProbeStatus;
    if (res.status === expected) status = "ok";
    else if (
      res.status >= COSTANTINO_DEGRADED_HTTP_STATUS_MIN &&
      res.status < COSTANTINO_DEGRADED_HTTP_STATUS_MAX_EXCLUSIVE
    ) status = "degraded";
    else status = "fail";
    if (status === "ok") metrics.probesOk += 1;
    else if (status === "degraded") metrics.probesDegraded += 1;
    else metrics.probesFailed += 1;
    return { status, latencyMs, httpStatus: res.status };
  } catch (err: unknown) {
    const latencyMs = Date.now() - t0;
    metrics.probesFailed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { name?: string })?.name === "AbortError" ? "TIMEOUT" : "FETCH_ERROR";
    return { status: "fail" as ProbeStatus, latencyMs, errorCode: code, errorMessage: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function toolUpdateAdminResourceHealth(args: Record<string, unknown>) {
  const slug = args.slug as string;
  const statusArg = args.status as string;
  const latencyMs = args.latencyMs as number;
  const message = args.message as string | undefined;

  if (!PROBE_STATUSES.includes(statusArg as ProbeStatus)) {
    return { error: `Invalid status: ${statusArg}. Expected one of: ${PROBE_STATUSES.join(", ")}` };
  }

  const [row] = await db.select().from(adminResources).where(eq(adminResources.slug, slug)).limit(1);
  if (!row) return { error: `No resource found with slug: ${slug}` };

  // Storage is the canonical writer — it does the resource_health_checks insert + parent
  // update atomically in a transaction and band-maps status → green/amber/red on the parent.
  const dbStatus = toDbProbeStatus(statusArg as ProbeStatus);
  const persistedMessage =
    statusArg === "degraded" && message
      ? `[degraded] ${message}`
      : statusArg === "degraded"
        ? "[degraded]"
        : message;
  const probeRow = await storage.recordProbeResult(
    row.id,
    row.kind as Parameters<typeof storage.recordProbeResult>[1],
    {
      status: dbStatus,
      latencyMs,
      errorMessage: persistedMessage,
    },
    null,
  );
  return { recorded: true, probeRowId: probeRow?.id ?? null };
}

async function toolWriteFinding(args: Record<string, unknown>, metrics: CostantinoCycleMetrics) {
  const kind = args.kind as string;
  const severity = args.severity as string;
  const targetKind = args.targetKind as string;
  const targetId = args.targetId as string;
  const description = args.description as string;
  const evidence = (args.evidence as Record<string, unknown> | undefined) ?? {};

  if (!FINDING_KINDS.includes(kind as (typeof FINDING_KINDS)[number])) {
    return { error: `Invalid kind: ${kind}` };
  }
  if (!FINDING_SEVERITIES.includes(severity as (typeof FINDING_SEVERITIES)[number])) {
    return { error: `Invalid severity: ${severity}` };
  }

  const [row] = await db
    .insert(costantinoFindings)
    .values({ kind, severity, targetKind, targetId, description, evidence })
    .returning();
  metrics.findingsOpened += 1;
  return { findingId: row.findingId };
}

async function toolListFindings(args: Record<string, unknown>) {
  const scope = (args.scope as string | undefined) ?? "open";
  const targetId = args.targetId as string | undefined;

  const conditions = [];
  if (scope === "open") conditions.push(isNull(costantinoFindings.resolvedAt));
  if (targetId) conditions.push(eq(costantinoFindings.targetId, targetId));

  const limit = scope === "recent" ? COSTANTINO_RECENT_FINDINGS_LIMIT : COSTANTINO_FINDINGS_PAGE_LIMIT;
  const rows = await db
    .select()
    .from(costantinoFindings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(costantinoFindings.detectedAt))
    .limit(limit);
  return rows.map((r) => ({
    findingId: r.findingId,
    kind: r.kind,
    severity: r.severity,
    targetKind: r.targetKind,
    targetId: r.targetId,
    description: r.description,
    detectedAt: r.detectedAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  }));
}

async function toolResolveFinding(args: Record<string, unknown>, metrics: CostantinoCycleMetrics) {
  const findingId = args.findingId as string;
  const note = args.note as string | undefined;

  const [existing] = await db
    .select()
    .from(costantinoFindings)
    .where(eq(costantinoFindings.findingId, findingId))
    .limit(1);
  if (!existing) return { error: `No finding found with id: ${findingId}` };

  const newEvidence = note
    ? { ...(existing.evidence ?? {}), resolution: note }
    : existing.evidence;

  await db
    .update(costantinoFindings)
    .set({ resolvedAt: sql`now()`, evidence: newEvidence })
    .where(eq(costantinoFindings.findingId, findingId));
  metrics.findingsResolved += 1;
  return { resolved: true };
}

// ---------------------------------------------------------------------------
// Freshness probe — national benchmark feed tables (Gaetano / Renato minions)
// ---------------------------------------------------------------------------

/** Whitelisted table/column pairs for check_table_freshness. */
const FRESHNESS_TABLE_MAP: Record<string, { table: string; column: string }> = {
  "vendor-passthrough-costs": { table: "vendor_passthrough_costs", column: "fetched_at" },
  "mgmt-co-markup-factors":   { table: "mgmt_co_markup_factors",   column: "fetched_at" },
};

async function toolCheckTableFreshness(args: Record<string, unknown>) {
  const slug = args.slug as string;
  const entry = FRESHNESS_TABLE_MAP[slug];
  if (!entry) {
    return { error: `Unknown national feed slug: ${slug}. Valid slugs: ${Object.keys(FRESHNESS_TABLE_MAP).join(", ")}` };
  }

  const [row] = await db
    .select({ config: adminResources.config })
    .from(adminResources)
    .where(eq(adminResources.slug, slug))
    .limit(1);

  const cfg = row?.config && typeof row.config === "object" ? (row.config as Record<string, unknown>) : {};
  const freshnessProbe = cfg.freshnessProbe && typeof cfg.freshnessProbe === "object"
    ? (cfg.freshnessProbe as Record<string, unknown>)
    : {};
  const thresholdDays = typeof freshnessProbe.thresholdDays === "number"
    ? freshnessProbe.thresholdDays
    : NATIONAL_FEED_QUARTERLY_TTL_DAYS;

  const result = await db.execute(
    sql`SELECT MAX(${sql.raw(entry.column)}) AS latest FROM ${sql.raw(entry.table)}`,
  );
  const latest = (result.rows[0] as { latest: Date | string | null } | undefined)?.latest ?? null;

  if (!latest) {
    return {
      fresh: false,
      latestFetchedAt: null,
      ageHours: null,
      thresholdDays,
      message: `Table ${entry.table} has no rows — feed has never run.`,
    };
  }

  const latestDate = latest instanceof Date ? latest : new Date(latest);
  const ageMs = Date.now() - latestDate.getTime();
  const ageHours = parseFloat((ageMs / (60 * 60 * 1_000)).toFixed(1));
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1_000;
  const fresh = ageMs <= thresholdMs;

  return {
    fresh,
    latestFetchedAt: latestDate.toISOString(),
    ageHours,
    thresholdDays,
    message: fresh
      ? `Feed is current (${ageHours}h old, threshold ${thresholdDays}d).`
      : `Feed is STALE: last fetched ${ageHours}h ago, threshold is ${thresholdDays}d.`,
  };
}

async function toolCompleteTask(args: Record<string, unknown>, metrics: CostantinoCycleMetrics) {
  const summary = args.summary as string;
  const timestamp = new Date().toISOString();
  const content = `# Costantino Cycle Summary\n\nGenerated: ${timestamp}\n\n${summary}\n`;
  await writeCostantinoHealth(content);
  metrics.completed = true;
  return { written: true };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function dispatchCostantinoTool(
  name: string,
  args: Record<string, unknown>,
  metrics: CostantinoCycleMetrics,
): Promise<unknown> {
  switch (name) {
    case "list_admin_resources":         return toolListAdminResources(args, metrics);
    case "get_probe_recipe":             return toolGetProbeRecipe(args);
    case "probe_integration_endpoint":   return toolProbeIntegrationEndpoint(args, metrics);
    case "update_admin_resource_health": return toolUpdateAdminResourceHealth(args);
    case "write_finding":                return toolWriteFinding(args, metrics);
    case "list_findings":                return toolListFindings(args);
    case "resolve_finding":              return toolResolveFinding(args, metrics);
    case "check_table_freshness":        return toolCheckTableFreshness(args);
    case "complete_task":                return toolCompleteTask(args, metrics);
    default:
      return { error: `Unknown Costantino tool: ${name}` };
  }
}
