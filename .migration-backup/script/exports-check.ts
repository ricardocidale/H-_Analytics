/**
 * Exports Check — finds unused public exports from calc/ and client/src/lib/.
 * Scans for `export function`, `export const`, `export class`, `export type`,
 * `export interface` and checks if they're imported anywhere else.
 *
 * Separates API contract types (interfaces, types in calc/) from truly unused
 * function/const exports to reduce false positives.
 *
 * Usage: npm run exports:check
 */
import { execSync } from "child_process";

interface UnusedExport {
  file: string;
  name: string;
  kind: string;
}

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }).trim();
  } catch {
    return "";
  }
}

const exportDirs = ["calc/", "client/src/lib/"];
const usageDirs = ["client/src/", "server/", "calc/", "shared/", "tests/", "engine/"];

const unused: UnusedExport[] = [];
const used: number[] = [0];

for (const dir of exportDirs) {
  const exportLines = run(
    `rg -n '^export (function|const|class|type|interface|enum) (\\w+)' ${dir} --glob '*.ts' --glob '*.tsx' -o 2>/dev/null`,
  );

  if (!exportLines) continue;

  for (const line of exportLines.split("\n").filter(Boolean)) {
    const match = line.match(/^(.+?):(\d+):export (function|const|class|type|interface|enum) (\w+)/);
    if (!match) continue;

    const [, file, , kind, name] = match;

    if (file.endsWith("index.ts")) continue;
    if (name.length <= 2) continue;

    const usageCount = run(
      `rg -l '\\b${name}\\b' ${usageDirs.join(" ")} --glob '*.ts' --glob '*.tsx' 2>/dev/null | grep -v '${file}' | wc -l`,
    );

    const count = parseInt(usageCount) || 0;
    if (count === 0) {
      unused.push({ file, name, kind });
    } else {
      used[0]++;
    }
  }
}

const apiContractKinds = new Set(["interface", "type"]);
const apiContractPaths = ["calc/", "client/src/lib/financial/", "client/src/lib/audits/"];

const apiContracts = unused.filter(
  u => apiContractKinds.has(u.kind) && apiContractPaths.some(p => u.file.startsWith(p)),
);
const schemaContracts = unused.filter(
  u => u.file.includes("calc/shared/schemas.ts") && u.kind === "const" && u.name.endsWith("Schema"),
);
const intentionalFiles = [
  "client/src/lib/analytics.ts",
  "client/src/lib/runVerification.ts",
];
const intentionalExports = unused.filter(u => intentionalFiles.includes(u.file));
const contracts = [...apiContracts, ...schemaContracts, ...intentionalExports];
const contractSet = new Set(contracts.map(c => `${c.file}:${c.name}`));
const trulyUnused = unused.filter(u => !contractSet.has(`${u.file}:${u.name}`));

console.log("");
console.log("  Exports Check");
console.log("  " + "─".repeat(52));

if (trulyUnused.length === 0 && contracts.length === 0) {
  console.log(`  ✓ All ${used[0]} public exports are used`);
} else {
  console.log(`  ${used[0]} exports used, ${trulyUnused.length} unused, ${contracts.length} API contracts`);

  if (trulyUnused.length > 0) {
    console.log("");
    console.log("  Unused exports:");
    const byFile = new Map<string, UnusedExport[]>();
    for (const u of trulyUnused) {
      const existing = byFile.get(u.file) ?? [];
      existing.push(u);
      byFile.set(u.file, existing);
    }
    for (const [file, exports] of byFile) {
      console.log(`  ${file}`);
      for (const e of exports) {
        console.log(`    ${e.kind} ${e.name}`);
      }
    }
  }

  if (contracts.length > 0) {
    console.log("");
    console.log("  API contracts (kept intentionally):");
    const byFile = new Map<string, UnusedExport[]>();
    for (const u of contracts) {
      const existing = byFile.get(u.file) ?? [];
      existing.push(u);
      byFile.set(u.file, existing);
    }
    for (const [file, exports] of byFile) {
      console.log(`  ${file}`);
      for (const e of exports) {
        console.log(`    ${e.kind} ${e.name}`);
      }
    }
  }
}

console.log("  " + "─".repeat(52));
console.log("");
