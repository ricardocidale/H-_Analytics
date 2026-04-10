/**
 * Verify Summary — runs 15-phase financial verification in a single vitest invocation.
 * Outputs only failures + audit opinion. ~3x faster than running each phase separately.
 *
 * Usage: npm run verify:summary
 */
import { execSync } from "child_process";
import { stripAnsi } from "./lib/test-parser.js";
import { header, footer } from "./lib/formatter.js";
import { VERIFY_PHASES, allProofFilePaths } from "./lib/verify-phases.js";

const allFiles = allProofFilePaths().join(" ");
let allPassed = true;
const results: string[] = [];

function parseOutput(raw: string) {
  const clean = stripAnsi(raw);
  const lines = clean.split("\n");

  for (const phase of VERIFY_PHASES) {
    const fileLine = lines.find((l) => l.includes(phase.file) && !l.trimStart().startsWith("stdout") && !l.trimStart().startsWith("stderr"))
      ?? lines.find((l) => l.includes(phase.file));

    if (!fileLine) {
      allPassed = false;
      results.push(`  \u2717 ${phase.name.padEnd(22)} FAIL (not found in output)`);
      continue;
    }

    const isFail = fileLine.includes("\u00d7") || fileLine.includes("\u2717") || fileLine.trimStart().startsWith("\u00d7");
    const isPass = fileLine.includes("\u2713") || fileLine.trimStart().startsWith("\u2713");

    if (isFail) {
      allPassed = false;
      const testCount = fileLine.match(/\((\d+) tests?.*?\)/);
      results.push(`  \u2717 ${phase.name.padEnd(22)} FAIL${testCount ? ` (${testCount[1]} tests)` : ""}`);

      const phaseFileBase = phase.file.replace(".test.ts", "");
      const phaseStart = lines.findIndex((l: string) => l.includes(phaseFileBase) && (l.includes("FAIL") || l.includes("\u00d7")));
      const phaseEnd = phaseStart >= 0
        ? lines.findIndex((l: string, i: number) => i > phaseStart && (l.includes(".test.ts") || l.trimStart() === ""))
        : -1;
      const scopedLines = phaseStart >= 0
        ? lines.slice(phaseStart, phaseEnd > phaseStart ? phaseEnd : phaseStart + 20)
        : lines;
      const failDetails = scopedLines
        .filter((l: string) =>
          (l.includes("AssertionError") || l.includes("AssertError") || l.includes("expected") || l.includes("Error:")) &&
          !l.includes("node_modules"),
        )
        .slice(0, 3);
      for (const line of failDetails) {
        results.push(`    \u2192 ${line.trim().slice(0, 100)}`);
      }
    } else if (isPass) {
      const testCount = fileLine.match(/\((\d+) tests?.*?\)/);
      results.push(`  \u2713 ${phase.name.padEnd(22)} PASS${testCount ? ` (${testCount[1]})` : ""}`);
    } else {
      allPassed = false;
      results.push(`  \u2717 ${phase.name.padEnd(22)} UNKNOWN`);
    }
  }
}

try {
  const raw = execSync(`npx vitest run ${allFiles} 2>&1`, {
    encoding: "utf-8",
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  parseOutput(raw);
} catch (err: unknown) {
  const e = err as { stdout?: string; stderr?: string };
  const raw = (e.stdout ?? "") + (e.stderr ?? "");
  parseOutput(raw);
}

header("Verification Summary");
for (const r of results) console.log(r);
footer();
console.log(`  Opinion: ${allPassed ? "UNQUALIFIED" : "ADVERSE"}`);
console.log(`  Status:  ${allPassed ? "PASS" : "FAIL"}\n`);
process.exit(allPassed ? 0 : 1);
