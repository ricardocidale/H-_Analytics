/**
 * Shared test output parsing utilities for diagnostic scripts.
 */

/** Strip ANSI escape codes from raw terminal output. */
export function stripAnsi(raw: string): string {
  return raw.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Parse vitest output into a structured result with pass/fail status and summary line. */
export function parseTestOutput(raw: string): { passed: boolean; summary: string; clean: string } {
  const clean = stripAnsi(raw);
  const failMatch = clean.match(/(\d+) failed/);
  if (failMatch) {
    const failCount = failMatch[1];
    const failLine = clean
      .split("\n")
      .find((l) => l.includes("FAIL") || l.includes("\u2717") || l.includes("\u00d7"));
    return {
      passed: false,
      summary: `FAIL (${failCount} failed)${failLine ? " \u2014 " + failLine.trim().slice(0, 80) : ""}`,
      clean,
    };
  }
  const testsMatch = clean.match(/Tests\s+(\d+)\s+passed\s*(?:\|\s*\d+\s+skipped\s*)?\((\d+)\)/);
  const filesMatch = clean.match(/Test Files\s+(\d+)\s+passed\s*(?:\|\s*\d+\s+skipped\s*)?\((\d+)\)/);
  if (testsMatch && filesMatch) {
    return {
      passed: true,
      summary: `PASS (${testsMatch[1]}/${testsMatch[2]} tests, ${filesMatch[1]} files)`,
      clean,
    };
  }
  const summaryLines = clean.split("\n").filter((l) =>
    /^\s*(Test Files|Tests)\s+\d+/.test(l) || /\d+\s+(passed|failed)/.test(l)
  );
  const summaryBlock = summaryLines.join(" ");
  const hasPass = summaryBlock.includes("passed") || clean.includes("PASS");
  const hasFail = /\b\d+\s+failed\b/.test(summaryBlock);
  return {
    passed: hasPass && !hasFail,
    summary: hasPass && !hasFail ? "PASS" : "FAIL (see npm test)",
    clean,
  };
}
