import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  REPO_ROOT,
  collectReachableFiles,
  listTsFilesRecursive,
} from "./_helpers/import-graph";

/**
 * Risk Intelligence Orchestrator — split-coverage audit.
 *
 * Audit #319 R5 Phase 6 split `server/ai/risk-intelligence.ts` into focused
 * per-concern modules under `server/ai/risk/`:
 *   - benchmarks.ts, helpers.ts, llm-brief.ts
 *   - insights-{leverage,assumptions,macro,regulatory,concentration,stress}.ts
 *
 * The orchestrator's `generateDeterministicInsights` calls one generator per
 * `insights-*.ts` file and concatenates the results. A future contributor
 * could add a new `insights-*.ts` file but forget to register its generator
 * in `generateDeterministicInsights`; the missing category would silently
 * disappear from every risk brief without any test failure.
 *
 * This test mirrors the Task #475 pattern. It asserts:
 *   1. Every `.ts` module under `server/ai/risk/` is statically reachable
 *      from `server/ai/risk-intelligence.ts`.
 *   2. Every `insights-*.ts` file's exported `generate*Insights` symbol is
 *      both imported by the orchestrator AND invoked inside the body of
 *      `generateDeterministicInsights` — adding a new `insights-*.ts` file
 *      forces the developer to wire the generator into the orchestration.
 */

const SCOPE_DIR = path.resolve(REPO_ROOT, "server/ai/risk");
const ORCHESTRATOR = path.resolve(REPO_ROOT, "server/ai/risk-intelligence.ts");

function relToRepo(p: string): string {
  return path.relative(REPO_ROOT, p);
}

function extractGeneratorName(file: string): string | null {
  const src = fs.readFileSync(file, "utf-8");
  // insights-*.ts files export a single top-level `generate…Insights` function
  // (sync or async). Capture it and use it as the structural "is wired" key.
  const m = src.match(/export\s+(?:async\s+)?function\s+(generate\w*Insights)\b/);
  return m ? m[1] : null;
}

describe("Risk Intelligence orchestrator — every split module is wired", () => {
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
    it(`${rel}: is reachable from server/ai/risk-intelligence.ts`, () => {
      expect(
        reachable.has(file),
        `Expected ${rel} to be reachable from server/ai/risk-intelligence.ts. ` +
          `If you added a new module under server/ai/risk/, wire it into the ` +
          `orchestrator (or into a module the orchestrator already imports).`,
      ).toBe(true);
    });
  }
});

describe("Risk Intelligence — every insights-*.ts generator is invoked by generateDeterministicInsights", () => {
  const insightFiles = listTsFilesRecursive(SCOPE_DIR).filter((f) =>
    /insights-[\w-]+\.ts$/.test(f),
  );
  const orchestratorSrc = fs.readFileSync(ORCHESTRATOR, "utf-8");

  // Slice out the body of `generateDeterministicInsights`. The signature can
  // contain `<`, `(`, and even `{` in the return type
  // (`Promise<{ insights: …; macroContext: … }>`), so we skip everything that
  // is at non-zero `(`, `<`, or `[` depth before treating a `{` as the body
  // opener. After the body opens we just match braces.
  function extractFunctionBody(src: string, name: string): string | null {
    const re = new RegExp(`\\bfunction\\s+${name}\\b`);
    const m = src.match(re);
    if (!m || m.index === undefined) return null;
    let paren = 0;
    let angle = 0;
    let bracket = 0;
    let brace = 0;
    let started = false;
    for (let i = m.index; i < src.length; i++) {
      const ch = src[i];
      if (!started) {
        if (ch === "(") paren++;
        else if (ch === ")") paren--;
        else if (ch === "[") bracket++;
        else if (ch === "]") bracket--;
        else if (ch === "<") angle++;
        else if (ch === ">") {
          // `=>` is not a closing angle; bail on that case.
          if (src[i - 1] !== "=" && angle > 0) angle--;
        } else if (ch === "{" && paren === 0 && angle === 0 && bracket === 0) {
          started = true;
          brace = 1;
        }
      } else {
        if (ch === "{") brace++;
        else if (ch === "}") {
          brace--;
          if (brace === 0) return src.slice(m.index, i + 1);
        }
      }
    }
    return null;
  }

  const orchestrationBody = extractFunctionBody(orchestratorSrc, "generateDeterministicInsights");

  it("generateDeterministicInsights function body is parseable", () => {
    expect(
      orchestrationBody,
      "Could not locate the body of generateDeterministicInsights in risk-intelligence.ts. " +
        "If the function was renamed, update this test to match.",
    ).not.toBeNull();
  });

  it("at least one insights-*.ts module exists", () => {
    expect(insightFiles.length).toBeGreaterThan(0);
  });

  for (const file of insightFiles) {
    const rel = relToRepo(file);
    const generator = extractGeneratorName(file);

    it(`${rel}: exports a top-level generate…Insights function`, () => {
      expect(
        generator,
        `Expected ${rel} to export a single \`export function generate…Insights\`. ` +
          `If you used a different naming convention, update this test or align the export.`,
      ).not.toBeNull();
    });

    if (!generator || !orchestrationBody) continue;

    it(`${rel}: ${generator} is imported by risk-intelligence.ts`, () => {
      const importRe = new RegExp(`\\b${generator}\\b[\\s\\S]*?from\\s+["']\\./risk/`);
      expect(
        importRe.test(orchestratorSrc),
        `Expected risk-intelligence.ts to import \`${generator}\` from ./risk/. ` +
          `Add the import alongside the existing insight-generator imports.`,
      ).toBe(true);
    });

    it(`${rel}: ${generator} is called inside generateDeterministicInsights`, () => {
      // Plain call site: `generator(properties)` etc. The function-body slice
      // already excludes other functions in the file, so a substring check is
      // safe and cheap.
      expect(
        orchestrationBody.includes(`${generator}(`),
        `Expected generateDeterministicInsights to invoke \`${generator}\`. ` +
          `Imports without invocation are dead wiring — call the generator and ` +
          `merge its output into the returned insights array.`,
      ).toBe(true);
    });
  }
});
