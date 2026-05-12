/**
 * check-llm-vendor-branching.ts
 *
 * Guards against the recurring "resolveLlm() + single hardcoded vendor client"
 * bug class fixed in task #1445.
 *
 * ## Background
 *
 * Code that picks a model via `resolveLlm()` / `resolveLlmFor()` (which read
 * the live `admin_resources` table) MUST then dispatch to the matching vendor
 * client. The bug pattern is:
 *
 *     const { vendor, modelId } = await resolveLlmFor("research-synthesis");
 *     const client = getGeminiClient();          // hard-coded vendor!
 *     await client.models.generateContent({ model: modelId, ... });
 *
 * When an admin then flips the slot from Gemini to Anthropic in the admin UI,
 * the code silently crashes — `modelId` is now an Anthropic model id but the
 * code keeps calling the Gemini SDK. Task #1445 fixed eight such routes; this
 * check exists so the bug cannot land again.
 *
 * ## What this check does
 *
 * Scans every *.ts file (excluding *.test.ts) under
 * `artifacts/api-server/src/**`.  For each file it detects:
 *   - whether `resolveLlm(` or `resolveLlmFor(` is called
 *   - which of `getGeminiClient(`, `getAnthropicClient(`, `getOpenAIClient(`
 *     are actually invoked
 *   - whether any vendor branching pattern exists, e.g.
 *       `vendor === "anthropic"`,  `vendorKey === "openai"`,
 *       `resolved.vendor === "google"`, `case "anthropic":`, or a ternary
 *       like `vendorKey === "anthropic" ? getAnthropicClient() : undefined`.
 *
 * A file is in violation when **all** of:
 *   1. it calls `resolveLlm` / `resolveLlmFor`, and
 *   2. it calls one or more vendor client(s), and
 *   3. it either calls fewer than three distinct vendor clients OR has no
 *      vendor branching pattern anywhere in the file.
 *
 * ## Allowlist
 *
 * Exported as `ALLOWLIST` for tests. Add a file to it ONLY when it is
 * legitimately single-vendor by API shape (e.g. OpenAI image generation has no
 * Anthropic/Gemini equivalent). Each entry must carry a short reason.
 *
 * Run via:
 *   pnpm --filter @workspace/scripts run check:llm-vendor-branching
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeInputsHash, tryCacheHit, writeCacheHit } from "./lib/check-cache.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

const SRC_ROOT = path.join(
  WORKSPACE_ROOT,
  "artifacts",
  "api-server",
  "src",
);

const VENDOR_CLIENT_FNS = [
  "getGeminiClient",
  "getAnthropicClient",
  "getOpenAIClient",
] as const;
type VendorClientFn = (typeof VENDOR_CLIENT_FNS)[number];

// ---------------------------------------------------------------------------
// Allowlist — paths are workspace-root-relative, forward slashes
// ---------------------------------------------------------------------------

export const ALLOWLIST: ReadonlyMap<string, string> = new Map([
  // Add entries ONLY for files that are legitimately single-vendor by API
  // shape. Every entry must explain WHY in one short sentence.
  //
  // ── image generation ──────────────────────────────────────────────────────
  [
    "artifacts/api-server/src/image/client.ts",
    "Image generation dispatches to Gemini Imagen or OpenAI DALL-E; Anthropic has no image-generation API.",
  ],
  [
    "artifacts/api-server/src/routes/images.ts",
    "Dispatches to Gemini (google) or OpenAI (openai) based on the resolved vendor; Anthropic has no image-generation API so a third vendor client cannot be added.",
  ],
  // ── analyst-table-refresh: OpenAI JSON mode ────────────────────────────────
  // These four files call openai.chat.completions.create with
  // response_format: { type: "json_object" }, which is an OpenAI-specific API
  // shape with no direct Anthropic/Gemini equivalent at this call site.
  [
    "artifacts/api-server/src/ai/analyst-refresh/capital-raise.ts",
    "Uses OpenAI chat.completions with response_format:json_object; the analyst-table-refresh slot is pinned to OpenAI because that JSON mode has no cross-vendor equivalent.",
  ],
  [
    "artifacts/api-server/src/ai/analyst-refresh/exit-multiples.ts",
    "Uses OpenAI chat.completions with response_format:json_object; the analyst-table-refresh slot is pinned to OpenAI because that JSON mode has no cross-vendor equivalent.",
  ],
  [
    "artifacts/api-server/src/ai/analyst-refresh/reference-brands.ts",
    "Uses OpenAI chat.completions with response_format:json_object; the analyst-table-refresh slot is pinned to OpenAI because that JSON mode has no cross-vendor equivalent.",
  ],
  [
    "artifacts/api-server/src/ai/analyst-refresh/reference-data.ts",
    "Uses OpenAI chat.completions with response_format:json_object; the analyst-table-refresh slot is pinned to OpenAI because that JSON mode has no cross-vendor equivalent.",
  ],
]);

// ---------------------------------------------------------------------------
// Detection regexes
// ---------------------------------------------------------------------------

const RESOLVE_LLM_RE = /\bresolveLlm(?:For)?\s*\(/;

/** Branch on a vendor identifier compared to a string literal. */
const VENDOR_LITERAL_BRANCH_RE =
  /\b\w*[Vv]endor\w*\s*[!=]==\s*["'](?:anthropic|openai|google|gemini)["']/;

/** Branch on a vendor identifier compared to another variable. */
const VENDOR_VAR_BRANCH_RE = /\b\w*[Vv]endor\w*\s*[!=]==\s*\w+/;

/** switch/case on a vendor literal. */
const VENDOR_CASE_RE = /\bcase\s+["'](?:anthropic|openai|google|gemini)["']\s*:/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function stripInlineComment(line: string): string {
  const idx = line.indexOf("//");
  return idx >= 0 ? line.slice(0, idx) : line;
}

function toRel(absPath: string): string {
  return path.relative(WORKSPACE_ROOT, absPath).replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------
// Input collection (exported for check-selective.ts)
// ---------------------------------------------------------------------------

function walkTsFiles(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(child, out);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      out.push(child);
    }
  }
}

export function collectInputFiles(): string[] {
  const files: string[] = [fileURLToPath(import.meta.url)];
  walkTsFiles(SRC_ROOT, files);
  return files;
}

// ---------------------------------------------------------------------------
// Per-file scan
// ---------------------------------------------------------------------------

export interface Violation {
  file: string;
  reason: string;
  hint: string;
}

export function scanFile(absPath: string): Violation[] {
  let content: string;
  try {
    content = fs.readFileSync(absPath, "utf8");
  } catch {
    return [];
  }

  // Build a "code-only" view of the file (strip pure comment lines and
  // inline `// ...` comment tails) so doc-comment examples don't trigger.
  const codeLines = content.split("\n").map((l) =>
    isCommentLine(l) ? "" : stripInlineComment(l),
  );
  const code = codeLines.join("\n");

  const hasResolver = RESOLVE_LLM_RE.test(code);
  if (!hasResolver) return [];

  const calledClients = new Set<VendorClientFn>();
  for (const fn of VENDOR_CLIENT_FNS) {
    const re = new RegExp(`\\b${fn}\\s*\\(`);
    if (re.test(code)) calledClients.add(fn);
  }
  if (calledClients.size === 0) return [];

  const hasBranch =
    VENDOR_LITERAL_BRANCH_RE.test(code) ||
    VENDOR_VAR_BRANCH_RE.test(code) ||
    VENDOR_CASE_RE.test(code);

  // Healthy: file dispatches to all three vendors AND has a branch.
  if (calledClients.size === 3 && hasBranch) return [];

  // Allowlisted single-vendor route?
  const rel = toRel(absPath);
  if (ALLOWLIST.has(rel)) return [];

  // Build the violation message.
  const clientList = [...calledClients].sort().join(", ");
  let reason: string;
  if (!hasBranch) {
    reason =
      `calls resolveLlm/resolveLlmFor and ${clientList} but has no ` +
      `\`vendor === "..."\` (or switch/case) branch — when an admin flips ` +
      `the model slot to a different vendor this route will crash.`;
  } else {
    reason =
      `calls resolveLlm/resolveLlmFor but only invokes ${clientList} ` +
      `(${calledClients.size}/3 vendors). The slot can resolve to any of ` +
      `anthropic/openai/google; missing branches will crash.`;
  }

  const hint =
    `Either dispatch on the resolved vendor (see ` +
    `artifacts/api-server/src/routes/slide-factory-suggest.ts for the ` +
    `canonical pattern) OR, if this route is genuinely single-vendor by ` +
    `API shape, add it to ALLOWLIST in scripts/src/check-llm-vendor-branching.ts ` +
    `with a one-sentence reason.`;

  return [{ file: rel, reason, hint }];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const CACHE_NAME = "llm-vendor-branching";

function main(): void {
  const inputFiles = collectInputFiles();
  const cacheHash = computeInputsHash({ files: inputFiles });
  if (tryCacheHit(CACHE_NAME, cacheHash)) return;

  const srcFiles = inputFiles.slice(1); // [0] is this script

  if (srcFiles.length === 0) {
    console.log(
      "check:llm-vendor-branching  PASS — no source files found to scan",
    );
    writeCacheHit(CACHE_NAME, cacheHash);
    return;
  }

  const allViolations: Violation[] = [];
  for (const f of srcFiles) {
    allViolations.push(...scanFile(f));
  }

  if (allViolations.length === 0) {
    console.log(
      `check:llm-vendor-branching  PASS — ${srcFiles.length} source file(s) scanned, no violations`,
    );
    writeCacheHit(CACHE_NAME, cacheHash);
    return;
  }

  console.error(
    `\n✖ check:llm-vendor-branching found ${allViolations.length} violation(s):\n`,
  );
  for (const v of allViolations) {
    console.error(`  ${v.file}`);
    console.error(`    ↳ ${v.reason}`);
    console.error(`    ↳ ${v.hint}`);
    console.error("");
  }

  console.error(
    "── Why this matters ─────────────────────────────────────────────────────",
  );
  console.error(
    "  resolveLlm()/resolveLlmFor() returns whatever vendor the admin has",
  );
  console.error(
    "  configured in admin_resources for that slot. Dispatching to a hard-",
  );
  console.error(
    "  coded SDK client silently crashes the route the moment an admin flips",
  );
  console.error(
    "  the slot to a different vendor. Task #1445 fixed eight such routes.",
  );
  console.error("");

  process.exit(1);
}

// Bundle-safe direct-run guard (uses argv basename, NOT import.meta.url).
const isDirectRun =
  Boolean(process.argv[1]) &&
  /check-llm-vendor-branching\.[jt]s(x?)$/.test(process.argv[1]);

if (isDirectRun) {
  main();
}
