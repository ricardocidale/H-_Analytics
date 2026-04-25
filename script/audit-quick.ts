/**
 * Audit Quick — fast code quality scan in ~15-20 lines.
 * Checks: `any` types in finance paths, TODO/FIXME/HACK counts,
 * console.log in production code, empty catch blocks, large files.
 *
 * Usage: npm run audit:quick
 */
import { execSync } from "child_process";

function grep(pattern: string, path: string, glob?: string): string[] {
  try {
    const globFlag = glob ? ` --glob '${glob}'` : "";
    const out = execSync(`rg -n '${pattern}' ${path}${globFlag} 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function countMatches(pattern: string, path: string, glob?: string): number {
  return grep(pattern, path, glob).length;
}

interface Finding {
  label: string;
  count: number;
  severity: "critical" | "warning" | "info";
  samples: string[];
}

const findings: Finding[] = [];

// 1. `any` types in finance calculation paths
const financeFiles = [
  "client/src/lib/financialEngine.ts",
  "client/src/lib/loanCalculations.ts",
  "client/src/lib/yearlyAggregator.ts",
  "client/src/lib/cashFlowAggregator.ts",
  "client/src/lib/equityCalculations.ts",
  "calc/",
];
let anyCount = 0;
let anySamples: string[] = [];
for (const f of financeFiles) {
  const matches = grep(": any[^.]|as any", f);
  anyCount += matches.length;
  anySamples.push(...matches);
}
findings.push({
  label: "`any` types in finance code",
  count: anyCount,
  severity: anyCount > 0 ? "critical" : "info",
  samples: anySamples.slice(0, 3),
});

// 2. TODO/FIXME/HACK in source code (exclude false positives: XX-X placeholders, $X,XXX currency formats)
const todoRaw = [
  ...grep("TODO|FIXME|HACK|XXX", "client/src/", "*.{ts,tsx}"),
  ...grep("TODO|FIXME|HACK|XXX", "server/", "*.ts"),
  ...grep("TODO|FIXME|HACK|XXX", "calc/", "*.ts"),
].filter(line => !/XX-X|\\$X[,.X]|X,XXX|X\.XM/.test(line));
const todoCount = todoRaw.length;
const todoSamples = todoRaw.slice(0, 3);
findings.push({
  label: "TODO/FIXME/HACK comments",
  count: todoCount,
  severity: todoCount > 10 ? "warning" : "info",
  samples: todoSamples,
});

// 3. console.log in production code (not test files, exclude logger.ts which IS the logger)
const consoleRaw = [
  ...grep("console\\.log\\(", "client/src/", "*.{ts,tsx}"),
  ...grep("console\\.log\\(", "server/", "*.ts"),
].filter(line => !line.includes("server/logger.ts"));
const consoleCount = consoleRaw.length;
const consoleSamples = consoleRaw.slice(0, 3);
findings.push({
  label: "console.log in production code",
  count: consoleCount,
  severity: consoleCount > 20 ? "warning" : "info",
  samples: consoleSamples,
});

// 4. Empty catch blocks (exclude .catch(() => ({})) json fallback pattern and /* ignore */ annotated catches)
const emptyCatchRaw = [
  ...grep("catch.*\\{\\s*\\}", "client/src/", "*.{ts,tsx}"),
  ...grep("catch.*\\{\\s*\\}", "server/", "*.ts"),
].filter(line => !line.includes("=> ({") && !line.includes("/* ignore"));
const emptyCatch = emptyCatchRaw.length;
findings.push({
  label: "Empty catch blocks",
  count: emptyCatch,
  severity: emptyCatch > 5 ? "warning" : "info",
  samples: [],
});

// 5. Large files (>500 lines)
const largeFiles: string[] = [];
try {
  const wc = execSync(
    `find client/src server shared calc -name '*.ts' -o -name '*.tsx' 2>/dev/null | xargs wc -l 2>/dev/null | sort -rn | head -12`,
    { encoding: "utf-8", timeout: 10_000 },
  );
  for (const line of wc.trim().split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(.+)/);
    if (match && parseInt(match[1]) > 500 && !match[2].includes("total")) {
      largeFiles.push(`${match[2]} (${match[1]} lines)`);
    }
  }
} catch {
  /* ignore: parse failure non-critical */
}
// Demoted from warning → info: the remaining >500-line files are being
// actively split as separate Phase C tasks. Keep the count visible so
// progress is trackable, but don't fail the audit on it.
findings.push({
  label: "Files over 500 lines",
  count: largeFiles.length,
  severity: "info",
  samples: largeFiles.slice(0, 5),
});

// 6. Non-null assertions (!) in finance code
let bangCount = 0;
for (const f of financeFiles) {
  bangCount += grep("!\\.", f).length;
}
findings.push({
  label: "Non-null assertions (!) in finance code",
  count: bangCount,
  severity: bangCount > 10 ? "warning" : "info",
  samples: [],
});

// 7. catch(x: any) violations
const catchAnyRaw = [
  ...grep("catch\\s*\\(\\s*\\w+\\s*:\\s*any\\s*\\)", "client/src/", "*.{ts,tsx}"),
  ...grep("catch\\s*\\(\\s*\\w+\\s*:\\s*any\\s*\\)", "server/", "*.ts"),
  ...grep("catch\\s*\\(\\s*\\w+\\s*:\\s*any\\s*\\)", "calc/", "*.ts"),
  ...grep("catch\\s*\\(\\s*\\w+\\s*:\\s*any\\s*\\)", "shared/", "*.ts"),
].filter(line => !line.includes(".test.ts"));
findings.push({
  label: "catch(x: any) violations",
  count: catchAnyRaw.length,
  severity: catchAnyRaw.length > 0 ? "critical" : "info",
  samples: catchAnyRaw.slice(0, 3),
});

// 8. Unsafe (x as Error).message casts
const unsafeErrorRaw = [
  ...grep("\\(\\s*\\w+\\s+as\\s+Error\\s*\\)\\.message", "client/src/", "*.{ts,tsx}"),
  ...grep("\\(\\s*\\w+\\s+as\\s+Error\\s*\\)\\.message", "server/", "*.ts"),
  ...grep("\\(\\s*\\w+\\s+as\\s+Error\\s*\\)\\.message", "calc/", "*.ts"),
].filter(line => !line.includes(".test.ts"));
findings.push({
  label: "Unsafe (x as Error).message casts",
  count: unsafeErrorRaw.length,
  severity: unsafeErrorRaw.length > 0 ? "warning" : "info",
  samples: unsafeErrorRaw.slice(0, 3),
});

// 9. @ts-ignore directives (prefer @ts-expect-error)
const tsIgnoreRaw = [
  ...grep("@ts-ignore", "client/src/", "*.{ts,tsx}"),
  ...grep("@ts-ignore", "server/", "*.ts"),
];
findings.push({
  label: "@ts-ignore directives",
  count: tsIgnoreRaw.length,
  severity: tsIgnoreRaw.length > 0 ? "warning" : "info",
  samples: tsIgnoreRaw.slice(0, 3),
});

// 10. as-any budget tracking
const serverAsAny = countMatches("\\bas\\s+any\\b", "server/", "*.ts");
const clientAsAny = countMatches("\\bas\\s+any\\b", "client/src/", "*.{ts,tsx}");
findings.push({
  label: `\`as any\` budget (server: ${serverAsAny}, client: ${clientAsAny})`,
  count: serverAsAny + clientAsAny,
  severity: "info",
  samples: [],
});

// 11. Catch compliance — catch blocks without `: unknown` annotation
const catchNoUnknownRaw = [
  ...grep("\\} catch \\(\\w+\\) \\{", "client/src/", "*.{ts,tsx}"),
  ...grep("\\} catch \\(\\w+\\) \\{", "server/", "*.ts"),
  ...grep("\\} catch \\(\\w+\\) \\{", "calc/", "*.ts"),
].filter(line => !line.includes(".test."));
findings.push({
  label: "catch without `: unknown`",
  count: catchNoUnknownRaw.length,
  severity: catchNoUnknownRaw.length > 0 ? "warning" : "info",
  samples: catchNoUnknownRaw.slice(0, 3),
});

// 12. Brand hex audit — hardcoded brand colors outside CSS/config
const brandHexRaw = [
  ...grep("#112548|#0091AE|#FDB817", "client/src/", "*.{ts,tsx}"),
  ...grep("#112548|#0091AE|#FDB817", "server/", "*.ts"),
].filter(line => !line.includes(".test.") && !line.includes("index.css") && !line.includes("constants"));
findings.push({
  label: "Hardcoded brand hex outside CSS",
  count: brandHexRaw.length,
  severity: brandHexRaw.length > 3 ? "warning" : "info",
  samples: brandHexRaw.slice(0, 3),
});

// 13. Prop `any` tracker — `: any` or `?: any` in component interfaces.
// Excludes index signatures (`[k: string]: any`) — those are bag-typings, not
// component props — and JSDoc/line comments where "any" appears as English text.
const propAnyRaw = [
  ...grep(":\\s*any[\\[;,\\s]|\\?:\\s*any[\\[;,\\s]", "client/src/", "*.{ts,tsx}"),
].filter(line => {
  if (line.includes(".test.") || line.includes("node_modules")) return false;
  // Strip "file:line:" prefix to inspect actual source
  const src = line.replace(/^[^:]+:\d+:/, "");
  // Skip JSDoc / line comments — "any" is just English here
  if (/^\s*(\*|\/\/)/.test(src)) return false;
  // Skip TS index signatures: `[k: string]: any`
  if (/\[\s*\w+\s*:\s*\w+\s*\]\s*:\s*any\b/.test(src)) return false;
  return true;
});
findings.push({
  label: "Prop `: any` in component types",
  count: propAnyRaw.length,
  severity: propAnyRaw.length > 5 ? "warning" : "info",
  samples: propAnyRaw.slice(0, 3),
});

// 14. Strip-pattern guard — fails if AnalystButton/SaveButton ever leaks
// back into the PageHeader actions block on CompanyAssumptions. Wired here
// (rather than as its own package script — package.json is read-only in
// this environment) so it runs alongside every audit:quick check.
let stripGuardCount = 0;
const stripGuardSamples: string[] = [];
try {
  execSync("tsx script/check-no-header-analyst-save.ts", {
    encoding: "utf-8",
    timeout: 15_000,
  });
} catch (err: unknown) {
  stripGuardCount = 1;
  const msg = err instanceof Error ? err.message : String(err);
  stripGuardSamples.push(msg.split("\n").find(Boolean) ?? "guard failed");
}
findings.push({
  label: "Strip-pattern guard (no Analyst/Save in header)",
  count: stripGuardCount,
  severity: stripGuardCount > 0 ? "critical" : "info",
  samples: stripGuardSamples,
});

// 15. Deprecated-constants guard — fails if a non-allowlisted file imports
// one of the six @deprecated symbols from shared/constants.ts (Task #407).
// Wired here for the same reason as the strip-pattern guard above.
let deprecatedConstGuardCount = 0;
const deprecatedConstGuardSamples: string[] = [];
try {
  execSync("tsx script/check-deprecated-constants.ts", {
    encoding: "utf-8",
    timeout: 30_000,
  });
} catch (err: unknown) {
  deprecatedConstGuardCount = 1;
  const msg = err instanceof Error ? err.message : String(err);
  deprecatedConstGuardSamples.push(
    msg.split("\n").find((l) => l.includes("[")) ?? "guard failed",
  );
}
findings.push({
  label: "Deprecated-constants guard (use getFactoryNumber)",
  count: deprecatedConstGuardCount,
  severity: deprecatedConstGuardCount > 0 ? "critical" : "info",
  samples: deprecatedConstGuardSamples,
});

// 16. Legacy storage URL guard — fails if a non-allowlisted file
// hard-codes a legacy storage host (`storage.googleapis.com`,
// `objectstorage.replit.com`, `*.repl.co/objects`) or sidecar bucket
// path (`/objects/uploads/<uuid>`). Catches new write paths *before*
// they ship, instead of waiting for the post-deploy reconciler to
// surface them on `main`. (Task #524.)
let legacyStorageGuardCount = 0;
const legacyStorageGuardSamples: string[] = [];
try {
  execSync("tsx script/check-no-legacy-storage-urls.ts", {
    encoding: "utf-8",
    timeout: 30_000,
  });
} catch (err: unknown) {
  legacyStorageGuardCount = 1;
  const msg = err instanceof Error ? err.message : String(err);
  legacyStorageGuardSamples.push(
    msg.split("\n").find((l) => l.includes("[")) ?? "guard failed",
  );
}
findings.push({
  label: "Legacy storage URL guard (use /objects/<key>)",
  count: legacyStorageGuardCount,
  severity: legacyStorageGuardCount > 0 ? "critical" : "info",
  samples: legacyStorageGuardSamples,
});

// Output
console.log("");
console.log("  Quick Audit");
console.log("  " + "─".repeat(52));

let issues = 0;
for (const f of findings) {
  const icon = f.count === 0 ? "✓" : f.severity === "critical" ? "✗" : f.severity === "warning" ? "!" : "·";
  console.log(`  ${icon} ${f.label.padEnd(38)} ${f.count.toString().padStart(4)}`);
  if (f.count > 0 && f.samples.length > 0) {
    for (const s of f.samples) {
      // Trim to just file:line portion
      const short = s.length > 100 ? s.slice(0, 100) + "…" : s;
      console.log(`      ${short}`);
    }
  }
  if (f.severity === "critical" && f.count > 0) issues++;
}

console.log("  " + "─".repeat(52));
console.log(`  ${issues === 0 ? "✓ No critical issues" : `✗ ${issues} critical issue${issues !== 1 ? "s" : ""}`}`);
console.log("");
process.exit(issues > 0 ? 1 : 0);
