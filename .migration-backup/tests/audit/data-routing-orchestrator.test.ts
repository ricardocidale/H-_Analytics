import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  REPO_ROOT,
  collectImports,
  collectReachableFiles,
  listTsFilesRecursive,
  resolveImport,
} from "./_helpers/import-graph";

/**
 * Data Router Orchestrator — split-coverage audit.
 *
 * The pre-split `server/ai/data-routing.ts` was a single ~1.4k-line file. It
 * was split into a thin orchestrator + per-concern modules under
 * `server/ai/data-routing/` (routing-table, service-registry, relaxation,
 * dispatchers, integration-status-sink, types) and per-service-category
 * dispatcher submodules under `server/ai/data-routing/dispatchers/`.
 *
 * Without a structural test, a future contributor could add a new dispatcher
 * file or a new module under the split scope and forget to wire it into the
 * orchestrator (or its dispatcher barrel). The bug would only surface at
 * runtime when a route happened to need that field, with the data router
 * silently returning `null`.
 *
 * This test mirrors the Task #475 pattern: it asserts every `.ts` module
 * inside `server/ai/data-routing/` is statically reachable from
 * `server/ai/data-routing.ts`'s import graph (or from a module the
 * orchestrator imports). It also asserts that the per-category dispatcher
 * modules' `handlers` keys are all merged into the dispatcher barrel —
 * adding a new file under `dispatchers/` without registering its `handlers`
 * map will fail this test.
 */

const SCOPE_DIR = path.resolve(REPO_ROOT, "server/ai/data-routing");
const ORCHESTRATOR = path.resolve(REPO_ROOT, "server/ai/data-routing.ts");
const DISPATCHER_BARREL = path.resolve(SCOPE_DIR, "dispatchers.ts");
const DISPATCHERS_DIR = path.resolve(SCOPE_DIR, "dispatchers");

function relToRepo(p: string): string {
  return path.relative(REPO_ROOT, p);
}

describe("Data Router orchestrator — every split module is wired", () => {
  it("orchestrator entry file exists", () => {
    expect(fs.existsSync(ORCHESTRATOR)).toBe(true);
  });

  it("scope directory exists and contains modules", () => {
    expect(fs.existsSync(SCOPE_DIR)).toBe(true);
    const files = listTsFilesRecursive(SCOPE_DIR);
    expect(files.length).toBeGreaterThan(0);
  });

  const reachable = collectReachableFiles([ORCHESTRATOR], {
    // Don't descend out of the scope or into shared/ to keep the walk bounded;
    // we only care that every file inside the split scope is reached.
    shouldDescend: (p) => p.startsWith(SCOPE_DIR + path.sep) || p === ORCHESTRATOR,
  });

  const scopeFiles = listTsFilesRecursive(SCOPE_DIR);

  for (const file of scopeFiles) {
    const rel = relToRepo(file);
    it(`${rel}: is reachable from server/ai/data-routing.ts`, () => {
      expect(
        reachable.has(file),
        `Expected ${rel} to be reachable from server/ai/data-routing.ts. ` +
          `If you added a new module under server/ai/data-routing/, wire it ` +
          `into the orchestrator (or into a module the orchestrator already ` +
          `imports) so callers can reach it.`,
      ).toBe(true);
    });
  }
});

describe("Data Router dispatchers — every per-category handler module is merged into the barrel", () => {
  it("dispatcher barrel exists", () => {
    expect(fs.existsSync(DISPATCHER_BARREL)).toBe(true);
  });

  // Read the barrel's import specifiers and resolve them to absolute paths.
  // The barrel must explicitly import each per-category dispatcher file and
  // spread its `handlers` map; this test asserts the import side. The
  // companion key-coverage assertion below checks the spread side.
  const barrelImports = collectImports(DISPATCHER_BARREL)
    .map((spec) => resolveImport(spec, DISPATCHER_BARREL))
    .filter((p): p is string => p !== null);

  const dispatcherFiles = listTsFilesRecursive(DISPATCHERS_DIR).filter(
    // _shared.ts only exports types/utilities consumed by category modules; it
    // is not itself a per-category handler bundle, so we exempt it from the
    // "must be re-exported by the barrel" rule. It is still covered by the
    // generic reachability check above.
    (f) => path.basename(f) !== "_shared.ts",
  );

  for (const file of dispatcherFiles) {
    const rel = relToRepo(file);
    it(`${rel}: is imported by server/ai/data-routing/dispatchers.ts`, () => {
      expect(
        barrelImports.includes(file),
        `Expected ${rel} to be imported by server/ai/data-routing/dispatchers.ts ` +
          `so its handlers map is merged into DISPATCH_HANDLERS. ` +
          `If you added a new dispatcher category, import its \`handlers\` ` +
          `export and spread it into DISPATCH_HANDLERS in dispatchers.ts.`,
      ).toBe(true);
    });
  }

  it("every per-category module's handler keys end up in the merged DISPATCH_HANDLERS", async () => {
    // Statically read each per-category file's `handlers` keys via regex —
    // dynamic import would require a full service registry. Each category
    // module defines `export const handlers: Record<string, DispatchHandler> = { … };`
    // so we capture the keys in the literal.
    const expectedKeys = new Set<string>();
    for (const file of dispatcherFiles) {
      const src = fs.readFileSync(file, "utf-8");
      const block = src.match(/export\s+const\s+handlers\s*:[^=]*=\s*\{([\s\S]*?)\};/);
      expect(block, `${relToRepo(file)} must export a \`handlers\` map`).toBeTruthy();
      const body = block![1];
      // Match identifiers and quoted keys at the top level of the object literal.
      // Properties look like `"key-name": fn,` or `keyName: fn,`. We split on
      // commas at brace-depth 0 and pull the key from each segment.
      let depth = 0;
      let segment = "";
      const segments: string[] = [];
      for (const ch of body) {
        if (ch === "{" || ch === "(" || ch === "[") depth++;
        else if (ch === "}" || ch === ")" || ch === "]") depth--;
        if (ch === "," && depth === 0) {
          segments.push(segment);
          segment = "";
          continue;
        }
        segment += ch;
      }
      if (segment.trim()) segments.push(segment);
      for (const s of segments) {
        const m = s.match(/^\s*(?:\[\s*)?("([^"]+)"|'([^']+)'|([A-Za-z_$][\w$-]*))/);
        if (!m) continue;
        const key = m[2] ?? m[3] ?? m[4];
        if (key) expectedKeys.add(key);
      }
    }

    // Pull the keys actually merged into the barrel by matching its handler
    // assignments. The barrel uses spread syntax: `...marketHandlers`, etc.
    // Since we already asserted each per-category file is imported, we treat
    // the union of per-category keys as the expected merged surface and rely
    // on the dispatcher.ts spread pattern to actually merge them. We then
    // confirm the spread happens for every imported handler binding.
    const barrelSrc = fs.readFileSync(DISPATCHER_BARREL, "utf-8");
    const importBindings = [...barrelSrc.matchAll(/import\s*\{\s*handlers\s+as\s+(\w+)\s*\}/g)].map(
      (m) => m[1],
    );
    expect(importBindings.length).toBe(dispatcherFiles.length);
    for (const binding of importBindings) {
      expect(
        new RegExp(`\\.\\.\\.${binding}\\b`).test(barrelSrc),
        `dispatchers.ts imports \`${binding}\` but never spreads it into ` +
          `DISPATCH_HANDLERS. Add \`...${binding}\` to the merged map.`,
      ).toBe(true);
    }

    // Sanity: at least one key was discovered.
    expect(expectedKeys.size).toBeGreaterThan(0);
  });
});
