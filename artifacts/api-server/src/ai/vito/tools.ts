/**
 * Vito compliance audit tools.
 *
 * Six deterministic tool functions — no LLM calls inside these.
 * The agent (agent.ts) wraps them as Anthropic tool definitions and calls
 * them during the tool loop.
 */
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { db } from "../../db";
import { adminResources, complianceViolations, vectorChunks } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { ToolParam } from "../../chat/tool-types";

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

/** Root of the monorepo lib/ directory relative to this file at runtime. */
const LIB_ROOTS = [
  path.resolve(process.cwd(), "lib/shared/src"),
  path.resolve(process.cwd(), "lib/db/src"),
];

/** Agent / route source directories (only available in dev; not in the production Docker bundle). */
const AGENT_SOURCE_DIRS = [
  path.resolve(process.cwd(), "artifacts/api-server/src/ai"),
  path.resolve(process.cwd(), "artifacts/api-server/src/routes"),
];

// ---------------------------------------------------------------------------
// Tool 1: scan lib constants
// ---------------------------------------------------------------------------

export interface SourceLine {
  file: string;
  lineNumber: number;
  lineContent: string;
}

/**
 * Scan lib/shared/src/constants*.ts and lib/db/src/constants*.ts for lines
 * matching any of the given patterns. When no patterns are provided, returns
 * all lines containing `DEFAULT_`.
 */
export async function scanLibConstants(patterns?: string[]): Promise<SourceLine[]> {
  const effectivePatterns = patterns && patterns.length > 0 ? patterns : ["DEFAULT_"];
  const results: SourceLine[] = [];

  for (const root of LIB_ROOTS) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.startsWith("constants") || !entry.endsWith(".ts")) continue;
      const filePath = path.join(root, entry);
      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (effectivePatterns.some((p) => line.includes(p))) {
          results.push({
            file: path.relative(process.cwd(), filePath),
            lineNumber: i + 1,
            lineContent: line.trim(),
          });
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tool 2: scan agent source files (full mode only)
// ---------------------------------------------------------------------------

export type ScanAgentResult = { unavailable: true } | SourceLine[];

/**
 * Scan agent source files for pattern matches. If source directories are not
 * readable (production Docker bundle), returns { unavailable: true }.
 */
export async function scanAgentSourceFiles(patterns: string[]): Promise<ScanAgentResult> {
  const results: SourceLine[] = [];

  for (const dir of AGENT_SOURCE_DIRS) {
    let readable = false;
    try {
      fs.readdirSync(dir);
      readable = true;
    } catch {
      // Not readable — likely production bundle
    }
    if (!readable) return { unavailable: true };

    const files = getAllTsFiles(dir);
    for (const filePath of files) {
      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (patterns.some((p) => line.includes(p))) {
          results.push({
            file: path.relative(process.cwd(), filePath),
            lineNumber: i + 1,
            lineContent: line.trim(),
          });
        }
      }
    }
  }

  return results;
}

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getAllTsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        files.push(fullPath);
      }
    }
  } catch {
    // ignore unreadable directories
  }
  return files;
}

// ---------------------------------------------------------------------------
// Tool 3: list admin_resources
// ---------------------------------------------------------------------------

export interface AdminResourceSummary {
  kind: string;
  slug: string;
  displayName: string;
  config: unknown;
}

/**
 * Returns all admin_resources rows, optionally filtered by kind.
 */
export async function listAdminResources(kind?: string): Promise<AdminResourceSummary[]> {
  const rows = kind
    ? await db
        .select({
          kind: adminResources.kind,
          slug: adminResources.slug,
          displayName: adminResources.displayName,
          config: adminResources.config,
        })
        .from(adminResources)
        .where(eq(adminResources.kind, kind as AdminResourceSummary["kind"]))
    : await db.select({
        kind: adminResources.kind,
        slug: adminResources.slug,
        displayName: adminResources.displayName,
        config: adminResources.config,
      }).from(adminResources);

  return rows.map((r) => ({
    kind: r.kind,
    slug: r.slug,
    displayName: r.displayName,
    config: r.config,
  }));
}

// ---------------------------------------------------------------------------
// Tool 4: list resolver call sites
// ---------------------------------------------------------------------------

export interface ResolverCallSite {
  file: string;
  slot: string;
}

/**
 * Scans lib/ TypeScript files for calls to resolveLlmFor(),
 * getAdminResourceBySlug(), and getParameterValue(). Returns a list of
 * { file, slot } entries where slot is the string argument.
 */
export async function listResolverCallSites(): Promise<ResolverCallSite[]> {
  const searchDirs = [
    path.resolve(process.cwd(), "artifacts/api-server/src"),
    path.resolve(process.cwd(), "lib"),
  ];

  // Pattern: resolveLlmFor("slot") or getAdminResourceBySlug("kind","slot") etc.
  const RESOLVER_PATTERNS = [
    /resolveLlmFor\(["']([^"']+)["']\)/g,
    /getAdminResourceBySlug\([^,]+,\s*["']([^"']+)["']\)/g,
    /getParameterValue\(["']([^"']+)["']\)/g,
  ];

  const results: ResolverCallSite[] = [];

  for (const searchDir of searchDirs) {
    let files: string[] = [];
    try {
      files = getAllTsFiles(searchDir);
    } catch {
      continue;
    }

    for (const filePath of files) {
      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }

      for (const pattern of RESOLVER_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          results.push({
            file: path.relative(process.cwd(), filePath),
            slot: match[1],
          });
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tool 5: list KB entry domains
// ---------------------------------------------------------------------------

export interface KbDomain {
  category: string;
  count: number;
}

/**
 * Returns a summary of distinct metadata->>'category' values in vector_chunks,
 * with row counts per category.
 */
export async function listKbEntryDomains(): Promise<KbDomain[]> {
  const rows = await db.execute<{ category: string; count: string }>(sql`
    SELECT
      metadata->>'category' AS category,
      COUNT(*)::text AS count
    FROM vector_chunks
    GROUP BY metadata->>'category'
    ORDER BY category
  `);

  return (rows.rows ?? []).map((r) => ({
    category: r.category ?? "(uncategorized)",
    count: Number(r.count),
  }));
}

// ---------------------------------------------------------------------------
// Tool 6: write violation (upsert on fingerprint)
// ---------------------------------------------------------------------------

export interface WriteViolationInput {
  violationType: string;
  severity: "block" | "warning" | "advisory" | "info";
  file: string;
  lineHint?: number;
  description: string;
  suggestedFix?: string;
}

export interface WriteViolationResult {
  id: number;
  isNew: boolean;
}

/**
 * Upserts a compliance_violations row keyed on the violation fingerprint.
 * On conflict (same fingerprint): updates lastSeenAt and lastRunId only.
 * Returns the row id and whether it was newly created.
 */
export async function writeViolation(
  runId: number,
  params: WriteViolationInput,
): Promise<WriteViolationResult> {
  const fingerprint = createHash("sha256")
    .update(`${params.violationType}:${params.file}:${params.description}`)
    .digest("hex");

  const [inserted] = await db
    .insert(complianceViolations)
    .values({
      violationFingerprint: fingerprint,
      violationType: params.violationType,
      severity: params.severity,
      file: params.file,
      lineHint: params.lineHint ?? null,
      description: params.description,
      suggestedFix: params.suggestedFix ?? null,
      lastRunId: runId,
    })
    .onConflictDoUpdate({
      target: complianceViolations.violationFingerprint,
      set: {
        lastSeenAt: sql`now()`,
        lastRunId: runId,
      },
    })
    .returning({ id: complianceViolations.id });

  // Distinguish new vs existing: fetch firstSeenAt and lastSeenAt
  const [row] = await db
    .select({
      id: complianceViolations.id,
      firstSeenAt: complianceViolations.firstSeenAt,
      lastSeenAt: complianceViolations.lastSeenAt,
    })
    .from(complianceViolations)
    .where(eq(complianceViolations.id, inserted.id));

  const isNew = row.firstSeenAt.getTime() === row.lastSeenAt.getTime();
  return { id: inserted.id, isNew };
}

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema for the Anthropic tool-calling API)
// ---------------------------------------------------------------------------

export function getVitoTools(): ToolParam[] {
  return [
    {
      name: "scan_lib_constants",
      description:
        "Scan lib/shared/src/constants*.ts and lib/db/src/constants*.ts for lines matching the given patterns. " +
        "When no patterns are supplied, returns all lines containing DEFAULT_. " +
        "Use to find misclassified or out-of-place constant definitions.",
      parameters: {
        type: "object",
        properties: {
          patterns: {
            type: "array",
            items: { type: "string" },
            description: "List of substrings to match. Defaults to ['DEFAULT_'] when omitted.",
          },
        },
        required: [],
      },
    },
    {
      name: "scan_agent_source_files",
      description:
        "Scan artifacts/api-server/src/ai/ and artifacts/api-server/src/routes/ for lines matching the given patterns. " +
        "Use to find hardcoded model name or API string literals. " +
        "Returns { unavailable: true } when source files are not accessible (production runtime).",
      parameters: {
        type: "object",
        properties: {
          patterns: {
            type: "array",
            items: { type: "string" },
            description: "List of substrings to search for (e.g. 'claude-', 'gpt-', 'gemini-').",
          },
        },
        required: ["patterns"],
      },
    },
    {
      name: "list_admin_resources",
      description:
        "List all admin_resources rows, optionally filtered by kind " +
        "(e.g. 'llm_slot', 'model', 'api', 'source', 'parameter'). " +
        "Use to compare configured resources against resolver call sites.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            description: "Filter by this kind value. Omit to return all rows.",
          },
        },
        required: [],
      },
    },
    {
      name: "list_resolver_call_sites",
      description:
        "Scan all TypeScript source files for calls to resolveLlmFor(), " +
        "getAdminResourceBySlug(), and getParameterValue(). " +
        "Returns { file, slot } pairs — use to cross-reference with admin_resources rows.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "list_kb_entry_domains",
      description:
        "Query the vector_chunks table for distinct metadata->>'category' values with row counts. " +
        "Use to assess KB domain coverage for the Pass 3 KB gap check.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "write_violation",
      description:
        "Upsert a compliance violation. On conflict (same fingerprint), only lastSeenAt and lastRunId are updated. " +
        "Always use this to record findings — never inline them in text.",
      parameters: {
        type: "object",
        properties: {
          violationType: {
            type: "string",
            enum: ["integration_identifier", "magic_number", "admin_resources_drift", "kb_gap"],
          },
          severity: {
            type: "string",
            enum: ["block", "warning", "advisory", "info"],
          },
          file: { type: "string", description: "File path relative to repo root." },
          lineHint: { type: "number", description: "Approximate line number (optional)." },
          description: { type: "string", description: "Brief factual description of the violation." },
          suggestedFix: { type: "string", description: "Optional one-line suggested fix." },
        },
        required: ["violationType", "severity", "file", "description"],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function dispatchVitoTool(
  runId: number,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "scan_lib_constants":
      return scanLibConstants(args.patterns as string[] | undefined);
    case "scan_agent_source_files":
      return scanAgentSourceFiles(args.patterns as string[]);
    case "list_admin_resources":
      return listAdminResources(args.kind as string | undefined);
    case "list_resolver_call_sites":
      return listResolverCallSites();
    case "list_kb_entry_domains":
      return listKbEntryDomains();
    case "write_violation":
      return writeViolation(runId, {
        violationType: args.violationType as string,
        severity: args.severity as "block" | "warning" | "advisory" | "info",
        file: args.file as string,
        lineHint: args.lineHint as number | undefined,
        description: args.description as string,
        suggestedFix: args.suggestedFix as string | undefined,
      });
    default:
      return { error: `Unknown Vito tool: ${name}` };
  }
}
