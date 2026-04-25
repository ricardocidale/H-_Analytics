import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  REPO_ROOT,
  collectReachableFiles,
  listTsFilesRecursive,
} from "./_helpers/import-graph";

/**
 * ICP Intelligence Orchestrator — split-coverage audit.
 *
 * Audit #319 R5 Phase 6 split `server/ai/icp-intelligence.ts` into focused
 * per-concern modules under `server/ai/icp/`:
 *   - portfolio-analysis.ts (Phase 1)
 *   - config-builder.ts, fallback-descriptive.ts, helpers.ts, prompt.ts (Phase 2)
 *   - orchestrator.ts (Phase 3 pipeline)
 *   - narrative.ts (research-prompt narrative builder consumed by callers)
 *
 * `server/ai/icp-intelligence.ts` is now a thin re-export shell. A future
 * contributor could add a new module under `server/ai/icp/` and forget to
 * surface it through the shell, leaving callers unable to reach the new
 * functionality. This audit asserts every `.ts` module under
 * `server/ai/icp/` is statically reachable from
 * `server/ai/icp-intelligence.ts`'s import graph.
 *
 * Mirrors the Task #475 pattern.
 */

const SCOPE_DIR = path.resolve(REPO_ROOT, "server/ai/icp");
const ORCHESTRATOR = path.resolve(REPO_ROOT, "server/ai/icp-intelligence.ts");

function relToRepo(p: string): string {
  return path.relative(REPO_ROOT, p);
}

describe("ICP Intelligence orchestrator — every split module is wired", () => {
  it("orchestrator entry file exists", () => {
    expect(fs.existsSync(ORCHESTRATOR)).toBe(true);
  });

  it("scope directory exists and contains modules", () => {
    expect(fs.existsSync(SCOPE_DIR)).toBe(true);
    const files = listTsFilesRecursive(SCOPE_DIR);
    expect(files.length).toBeGreaterThan(0);
  });

  const reachable = collectReachableFiles([ORCHESTRATOR], {
    shouldDescend: (p) => p.startsWith(SCOPE_DIR + path.sep) || p === ORCHESTRATOR,
  });

  const scopeFiles = listTsFilesRecursive(SCOPE_DIR);

  for (const file of scopeFiles) {
    const rel = relToRepo(file);
    it(`${rel}: is reachable from server/ai/icp-intelligence.ts`, () => {
      expect(
        reachable.has(file),
        `Expected ${rel} to be reachable from server/ai/icp-intelligence.ts. ` +
          `If you added a new module under server/ai/icp/, re-export its public ` +
          `surface from icp-intelligence.ts (or from a module the shell already ` +
          `re-exports) so callers can reach it.`,
      ).toBe(true);
    });
  }
});
