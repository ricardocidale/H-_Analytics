/**
 * Health Check — compact single-command output for AI token savings.
 * Runs: tsc → tests (including proof tests) → doc harmony, outputs ~5-7 lines.
 *
 * Optimization: proof test results are parsed from the single vitest run,
 * avoiding a redundant verify-runner invocation.
 *
 * Usage: npm run health
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { stripAnsi, parseTestOutput } from "./lib/test-parser.js";
import { header, footer, statusLine } from "./lib/formatter.js";
import { VERIFY_PHASES } from "./lib/verify-phases.js";

function parseVerificationFromTestOutput(clean: string): { passed: boolean; summary: string } {
  const startTime = Date.now();
  const failedNames: string[] = [];

  for (const phase of VERIFY_PHASES) {
    const fileRegex = new RegExp(phase.file.replace(".test.ts", ""));
    const lines = clean.split("\n").filter((l) => fileRegex.test(l));
    const hasFail = lines.some(
      (l) => l.includes("FAIL") || l.includes("\u2717") || l.includes("\u00d7"),
    );
    if (hasFail) {
      failedNames.push(phase.name.toLowerCase().replace(/\s+/g, "-"));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (failedNames.length === 0) {
    return { passed: true, summary: `PASS \u2014 UNQUALIFIED (${elapsed}s)` };
  }
  return { passed: false, summary: `FAIL \u2014 ${failedNames.join(", ")}` };
}

function checkDocHarmony(rawTestOutput: string): string {
  const claudeMd = readFileSync(".claude/claude.md", "utf-8");
  const replitMd = readFileSync("replit.md", "utf-8");

  const clean = stripAnsi(rawTestOutput);
  const totalMatch = clean.match(/Tests\s+\d+\s+passed\s*(?:\|\s*\d+\s+skipped\s*)?\((\d+)\)/);
  const actualTests = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  const rulesOut = execSync("ls .claude/rules/*.md 2>/dev/null | wc -l", { encoding: "utf-8", timeout: 5_000 });
  const actualRules = parseInt(rulesOut.trim(), 10) || 0;

  if (actualTests === 0) return "PASS (skipped \u2014 no test count)";

  const stale: string[] = [];

  function checkAll(content: string, file: string, pattern: RegExp, actual: number, label: string) {
    let m: RegExpExecArray | null;
    const re = new RegExp(pattern.source, "g");
    while ((m = re.exec(content)) !== null) {
      const documented = parseInt(m[1].replace(/,/g, ""), 10);
      if (documented !== actual) {
        stale.push(`${label}: ${file} says ${documented}, actual ${actual}`);
      }
    }
  }

  checkAll(claudeMd, "claude.md", /(\d[,\d]*)\s*tests/, actualTests, "tests");
  checkAll(replitMd, "replit.md", /(\d[,\d]*)\s*tests/, actualTests, "tests");
  checkAll(claudeMd, "claude.md", /Rules\s*\((\d+)/, actualRules, "rules");
  checkAll(replitMd, "replit.md", /rules\/?\s*\((\d+)/i, actualRules, "rules");

  if (stale.length === 0) return "PASS";
  const unique = [...new Set(stale)];
  return `FAIL \u2014 ${unique[0]}${unique.length > 1 ? ` (+${unique.length - 1} more)` : ""}`;
}

header("Health Check");

let allPassed = true;
let testRawOutput = "";
let testCleanOutput = "";

// Phase 1: TypeScript
try {
  const output = execSync("npx tsc --noEmit 2>&1", {
    timeout: 180_000,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (!output.trim()) {
    statusLine("\u2713", "TypeScript", "PASS (0 errors)");
  } else {
    const lines = output.trim().split("\n");
    const count = lines.filter((l) => l.includes("error TS")).length;
    if (count > 0) {
      allPassed = false;
      const errorLine = lines.find((l) => l.includes("error TS"));
      statusLine("\u2717", "TypeScript", `FAIL (${count} error${count !== 1 ? "s" : ""})${errorLine ? " \u2014 " + errorLine.trim().slice(0, 80) : ""}`);
    } else {
      statusLine("\u2713", "TypeScript", "PASS (0 errors)");
    }
  }
} catch (err: unknown) {
  const e = err as { stdout?: string; stderr?: string };
  const output = (e.stdout ?? "") + (e.stderr ?? "");
  const lines = output.trim().split("\n");
  const count = lines.filter((l: string) => l.includes("error TS")).length;
  if (count > 0) {
    allPassed = false;
    const errorLine = lines.find((l: string) => l.includes("error TS"));
    statusLine("\u2717", "TypeScript", `FAIL (${count} error${count !== 1 ? "s" : ""})${errorLine ? " \u2014 " + errorLine.trim().slice(0, 80) : ""}`);
  } else {
    statusLine("\u2713", "TypeScript", "PASS (0 errors)");
  }
}

// Phase 2: Tests (single vitest run — includes all proof tests)
try {
  testRawOutput = execSync("npx vitest run 2>&1", {
    timeout: 180_000,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
} catch (err: unknown) {
  const e = err as { stdout?: string; stderr?: string };
  testRawOutput = (e.stdout ?? "") + (e.stderr ?? "");
}

const testResult = parseTestOutput(testRawOutput);
testCleanOutput = testResult.clean;
if (!testResult.passed) allPassed = false;
statusLine(testResult.passed ? "\u2713" : "\u2717", "Tests", testResult.summary);

// Phase 3: Verification (parsed from the same test output — no re-run)
const verifyResult = parseVerificationFromTestOutput(testCleanOutput);
if (!verifyResult.passed) allPassed = false;
statusLine(verifyResult.passed ? "\u2713" : "\u2717", "Verification", verifyResult.summary);

// Phase 4: Doc Harmony
{
  const result = checkDocHarmony(testRawOutput);
  const passed = result.startsWith("PASS");
  if (!passed) allPassed = false;
  statusLine(passed ? "\u2713" : "\u2717", "Doc Harmony", result);
}

footer();
console.log(`  ${allPassed ? "\u2713 ALL CLEAR" : "\u2717 ISSUES FOUND"}\n`);
process.exit(allPassed ? 0 : 1);
