/**
 * check-types-mirror.ts
 *
 * Guard against silent drift between two files that the workspace contract
 * forces us to keep as hand-maintained mirrors:
 *
 *   - artifacts/api-server/src/slides/types.ts                        (source of truth)
 *   - artifacts/hospitality-business-portal/src/features/internal-deck/types.ts  (mirror)
 *
 * Cross-artifact imports are forbidden in this monorepo, so the React deck
 * route in the portal carries its own copy of the SlidePayload shape. If the
 * server renames or reshapes a field and the mirror doesn't follow, the deck
 * silently renders "undefined" cells (no compile error, no runtime error in
 * dev — only the printed PDF reveals the drift).
 *
 * This check normalizes both files (strip the leading /** ... *\/ doc-comment,
 * collapse whitespace) and asserts the bodies are byte-identical. The
 * doc-comments are deliberately allowed to diverge because they describe the
 * file's role from each artifact's perspective.
 *
 * Fix when this fails: copy the source-of-truth body over the mirror body
 * (preserving the mirror's doc-comment header), then re-run.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { computeInputsHash, tryCacheHit, writeCacheHit } from "./lib/check-cache.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const SOURCE = path.join(REPO_ROOT, "artifacts/api-server/src/slides/types.ts");
const MIRROR = path.join(
  REPO_ROOT,
  "artifacts/hospitality-business-portal/src/features/internal-deck/types.ts",
);

/**
 * Drop the leading block doc-comment (`/** ... *\/`) — the part each file is
 * allowed to write differently — then collapse runs of whitespace and trim.
 * Result is a normalized representation of "what the file actually exports".
 */
function normalizeBody(src: string): string {
  const headerRe = /^\s*\/\*\*[\s\S]*?\*\/\s*/;
  const withoutHeader = src.replace(headerRe, "");
  return withoutHeader.replace(/\s+/g, " ").trim();
}

function readOrFail(p: string): string {
  if (!fs.existsSync(p)) {
    console.error(`[check:types-mirror] Missing file: ${p}`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}

const CACHE_NAME = "types-mirror";

function main(): void {
  // Input-hash cache (task #1214). Inputs are the script itself plus the two
  // mirrored files; if neither has changed since the last green run, skip.
  const cacheHash = computeInputsHash({
    files: [fileURLToPath(import.meta.url), SOURCE, MIRROR],
  });
  if (tryCacheHit(CACHE_NAME, cacheHash)) return;

  const srcRaw = readOrFail(SOURCE);
  const mirrorRaw = readOrFail(MIRROR);

  const srcNorm = normalizeBody(srcRaw);
  const mirrorNorm = normalizeBody(mirrorRaw);

  if (srcNorm === mirrorNorm) {
    console.log(
      `[check:types-mirror] OK — ${path.relative(REPO_ROOT, SOURCE)} ≡ ${path.relative(REPO_ROOT, MIRROR)} (header excluded)`,
    );
    writeCacheHit(CACHE_NAME, cacheHash);
    return;
  }

  console.error("[check:types-mirror] FAIL — mirror has drifted from source.");
  console.error("");
  console.error(`  Source: ${path.relative(REPO_ROOT, SOURCE)}`);
  console.error(`  Mirror: ${path.relative(REPO_ROOT, MIRROR)}`);
  console.error("");
  console.error("Fix:");
  console.error("  1. Treat the api-server file as the source of truth.");
  console.error("  2. Copy its exported types verbatim into the portal mirror,");
  console.error("     preserving each file's existing doc-comment header.");
  console.error("  3. Re-run `pnpm --filter @workspace/scripts run check:types-mirror`.");
  console.error("");
  console.error("First differing region (after normalization):");
  const len = Math.min(srcNorm.length, mirrorNorm.length);
  let i = 0;
  while (i < len && srcNorm[i] === mirrorNorm[i]) i += 1;
  const start = Math.max(0, i - 40);
  const end = Math.min(len, i + 80);
  console.error(`  src    @${i}: …${srcNorm.slice(start, end)}…`);
  console.error(`  mirror @${i}: …${mirrorNorm.slice(start, end)}…`);
  process.exit(1);
}

main();
