/**
 * check-selective.test.ts
 *
 * Guards the collectInputFiles() contract for every check script registered in
 * check-selective.ts.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * check-selective.ts imports `collectInputFiles` directly from each check script
 * so that input-collection logic never drifts between the selective driver and
 * the individual check.  Any new check script added to SCRIPT_CHECKS that
 * forgets to export `collectInputFiles` causes a runtime import error instead of
 * a clear build error.  This test catches that mistake at CI time.
 *
 * WHAT IT CHECKS
 * --------------
 * 1. check-selective.ts exists (sanity guard).
 * 2. At least one `collectInputFiles` import is found (parser smoke test).
 * 3. For every `collectInputFiles` import in check-selective.ts, the
 *    corresponding .ts source file:
 *      a. exists on disk, and
 *      b. contains an `export … collectInputFiles` declaration.
 *
 * HOW TO FIX A FAILURE
 * --------------------
 * If you are adding a new check script to check-selective.ts, ensure the script
 * exports:
 *
 *   export function collectInputFiles(): string[] {
 *     // return the list of files whose contents affect this check
 *     return [ ... ];
 *   }
 *
 * Then add the import + registry entry to check-selective.ts following the
 * existing pattern.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SELECTIVE_SCRIPT = path.join(__dirname, "check-selective.ts");

/**
 * Parse all module paths that export `collectInputFiles` from
 * check-selective.ts by matching import statements of the form:
 *
 *   import { collectInputFiles as collectInputFiles_xxx } from "./check-xxx.js";
 *
 * Returns the raw specifier string (e.g. "./check-lint.js") for each match.
 */
function parseCollectInputImportPaths(): string[] {
  const source = fs.readFileSync(SELECTIVE_SCRIPT, "utf8");
  const importRe =
    /import\s*\{[^}]*collectInputFiles[^}]*\}\s*from\s*["']([^"']+)["']/g;
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(source)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

describe("check-selective: collectInputFiles() export contract", () => {
  it("check-selective.ts exists", () => {
    expect(fs.existsSync(SELECTIVE_SCRIPT)).toBe(true);
  });

  it("at least one collectInputFiles import is present in check-selective.ts", () => {
    const imports = parseCollectInputImportPaths();
    expect(imports.length).toBeGreaterThan(0);
  });

  it("every check script imported by check-selective.ts exports collectInputFiles()", () => {
    const importPaths = parseCollectInputImportPaths();
    const failures: string[] = [];

    for (const specifier of importPaths) {
      // The imports use ".js" extensions (Node ESM convention); map to the
      // actual ".ts" source file that lives next to this test.
      const tsSpecifier = specifier.replace(/\.js$/, ".ts");
      const absolutePath = path.resolve(__dirname, tsSpecifier);

      if (!fs.existsSync(absolutePath)) {
        failures.push(`${tsSpecifier}: source file not found at ${absolutePath}`);
        continue;
      }

      const source = fs.readFileSync(absolutePath, "utf8");

      // Match any of the common export forms:
      //   export function collectInputFiles(...)
      //   export async function collectInputFiles(...)
      //   export const collectInputFiles = ...
      const hasExport =
        /export\s+(?:async\s+)?function\s+collectInputFiles\b/.test(source) ||
        /export\s+const\s+collectInputFiles\b/.test(source);

      if (!hasExport) {
        failures.push(
          `${tsSpecifier}: missing \`export function collectInputFiles()\` (or equivalent const export)`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(
        "The following check scripts are imported by check-selective.ts but do not " +
          "export collectInputFiles().\n" +
          "Add the export or remove the import from check-selective.ts:\n\n" +
          failures.map((f) => `  • ${f}`).join("\n"),
      );
    }
  });
});
