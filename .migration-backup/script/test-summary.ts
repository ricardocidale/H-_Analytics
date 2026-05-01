/**
 * Test Summary — runs all tests, outputs only failures + one summary line.
 * Saves ~40-50 lines of token context vs `npm test`.
 *
 * Usage: npm run test:summary
 */
import { execSync } from "child_process";
import { stripAnsi, parseTestOutput } from "./lib/test-parser.js";

let raw = "";
try {
  raw = execSync("npx vitest run", {
    encoding: "utf-8",
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
} catch (err: unknown) {
  // vitest may exit non-zero even when all tests pass (e.g. DB connection teardown in CI).
  // execSync puts the captured output in err.stdout/stderr when the command fails.
  const e = err as { stdout?: string | Buffer; stderr?: string | Buffer };
  const stdout = typeof e.stdout === "string" ? e.stdout : e.stdout?.toString("utf-8") ?? "";
  const stderr = typeof e.stderr === "string" ? e.stderr : e.stderr?.toString("utf-8") ?? "";
  raw = stdout + stderr;
}

const result = parseTestOutput(raw);

if (result.passed) {
  console.log(result.summary);
  process.exitCode = 0;
} else {
  const clean = stripAnsi(raw);
  const lines = clean.split("\n");

  const failLines = lines.filter(
    (l: string) =>
      (l.includes("FAIL") && l.includes(".test.")) ||
      l.includes("AssertionError") ||
      (l.includes("Error:") && !l.includes("node_modules") && !l.includes("expected") && !l.includes("CSV download")),
  );

  if (failLines.length > 0) {
    console.log("FAILURES:");
    for (const line of failLines.slice(0, 15)) {
      console.log("  " + line.trim());
    }
    console.log("");
  }

  console.log(result.summary);
  process.exitCode = 1;
}

// Force exit — vitest/DB may leave dangling connections that prevent clean shutdown
setTimeout(() => process.exit(process.exitCode ?? 0), 200);
