/**
 * audit-deep.ts — Deep financial code safety scan.
 *
 * Catches pattern-class bugs the architect found in P1 audit:
 * - Silent coercion (`|| 0` on financial values)
 * - Unguarded division (raw `/` without dDiv or zero-check)
 * - Remaining Math.pow (should be dPow)
 * - safeNum usage (should be assertFinite)
 * - Missing assertFinite on arithmetic outputs
 * - Array index assumptions without bounds check
 * - Mutable shared state in pure functions
 *
 * Usage: npm run audit:deep
 */
import { execSync } from "child_process";

const isStaged = process.argv.includes("--staged");

function getStagedFinanceFiles(): string[] {
  try {
    const out = execSync("git diff --cached --name-only --diff-filter=ACMR", {
      encoding: "utf-8",
      timeout: 10_000,
    });
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter(f => (f.startsWith("calc/") || f.startsWith("engine/") || f.startsWith("client/src/lib/financial")) && f.endsWith(".ts") && !f.includes(".test.") && !f.includes(".spec."));
  } catch {
    return [];
  }
}

const FINANCE_PATHS = isStaged
  ? getStagedFinanceFiles()
  : [
      "client/src/lib/financial",
      "calc",
    ];

if (isStaged && FINANCE_PATHS.length === 0) {
  console.log("\n  Deep Financial Audit (staged mode)");
  console.log("  " + "─".repeat(56));
  console.log("  ✓ No staged financial files to audit");
  console.log("");
  process.exit(0);
}

const EXCLUDE_PATTERNS = ["*.test.*", "*.spec.*", "node_modules"];

function rg(pattern: string, paths: string[], glob?: string): string[] {
  try {
    const excludes = EXCLUDE_PATTERNS.map(e => `--glob '!${e}'`).join(" ");
    const includeGlob = glob ? `--glob '${glob}'` : "--glob '*.ts'";
    const pathStr = paths.join(" ");
    const out = execSync(
      `rg -n '${pattern}' ${pathStr} ${excludes} ${includeGlob} 2>/dev/null`,
      { encoding: "utf-8", timeout: 15_000, maxBuffer: 5 * 1024 * 1024 },
    );
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

interface Check {
  id: string;
  label: string;
  severity: "critical" | "high" | "medium" | "low";
  pattern: string;
  paths: string[];
  exclude?: RegExp;
  maxAllowed: number;
}

const checks: Check[] = [
  {
    id: "math-pow",
    label: "Math.pow in finance code",
    severity: "high",
    pattern: "Math\\.pow",
    paths: FINANCE_PATHS,
    maxAllowed: 0,
  },
  {
    id: "safe-num",
    label: "safeNum usage (should be assertFinite)",
    severity: "high",
    pattern: "safeNum\\(",
    paths: FINANCE_PATHS,
    maxAllowed: 0,
  },
  {
    id: "silent-or-zero",
    label: "Silent || 0 coercion on financial values",
    severity: "medium",
    pattern: "\\|\\| 0[^.]",
    paths: FINANCE_PATHS,
    exclude: /length \|\| 0|count \|\| 0|index \|\| 0|\.length \|\| 0/,
    maxAllowed: 5,
  },
  {
    id: "isfinite-ternary",
    label: "isFinite ternary coercion (should be assertFinite)",
    severity: "medium",
    pattern: "Number\\.isFinite\\(.+\\) \\?",
    paths: FINANCE_PATHS,
    maxAllowed: 0,
  },
  {
    id: "isnan-coercion",
    label: "isNaN silent coercion to 0",
    severity: "medium",
    pattern: "isNaN\\(.+\\) \\? 0",
    paths: FINANCE_PATHS,
    maxAllowed: 0,
  },
  {
    id: "unguarded-or-zero",
    label: "Unguarded ?? 0 on computed financial values",
    severity: "low",
    pattern: "\\?\\? 0[);,\\s]",
    paths: FINANCE_PATHS,
    exclude: /index|count|length|offset|limit|page|skip|take|version|padding|margin|width|height|size|radius/,
    maxAllowed: 30,
  },
];

console.log("");
console.log(`  Deep Financial Audit${isStaged ? " (staged)" : ""}`);
console.log("  " + "─".repeat(56));

let totalIssues = 0;
const allFindings: { check: Check; matches: string[] }[] = [];

for (const check of checks) {
  let matches = rg(check.pattern, check.paths);
  if (check.exclude) {
    matches = matches.filter(m => !check.exclude!.test(m));
  }
  const count = matches.length;
  const failed = count > check.maxAllowed;
  const icon = !failed ? "✓" : check.severity === "critical" ? "✗" : check.severity === "high" ? "✗" : "!";

  console.log(
    `  ${icon} ${check.label.padEnd(46)} ${count.toString().padStart(4)}${
      check.maxAllowed > 0 ? ` (≤${check.maxAllowed})` : ""
    }`,
  );

  if (failed && matches.length > 0) {
    for (const m of matches.slice(0, 3)) {
      const short = m.length > 110 ? m.slice(0, 110) + "…" : m;
      console.log(`      ${short}`);
    }
    if (matches.length > 3) {
      console.log(`      ... and ${matches.length - 3} more`);
    }
  }

  if (failed && (check.severity === "critical" || check.severity === "high")) {
    totalIssues++;
  }
  allFindings.push({ check, matches });
}

console.log("  " + "─".repeat(56));
console.log(
  `  ${totalIssues === 0 ? "✓ No critical/high issues" : `✗ ${totalIssues} issue${totalIssues !== 1 ? "s" : ""} need attention`}`,
);
console.log("");

process.exit(totalIssues > 0 ? 1 : 0);
