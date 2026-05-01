import fs from "fs";
import path from "path";

const ROUTES_DIR = "server/routes";

interface RouteInfo {
  file: string;
  method: string;
  path: string;
  line: number;
  hasZod: boolean;
  hasBodyAccess: boolean;
  zodDetail: string;
}

function scanFile(filePath: string): RouteInfo[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const results: RouteInfo[] = [];
  const relPath = path.relative(process.cwd(), filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/app\.(post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/);
    if (!match) continue;

    const method = match[1].toUpperCase();
    const routePath = match[2];

    if (method === "DELETE") continue;

    const blockEnd = Math.min(i + 80, lines.length);
    const block = lines.slice(i, blockEnd).join("\n");

    const hasBodyAccess = /req\.body/.test(block);

    const bodyIsStream = /for\s+await\s+.*of\s+req\b/.test(block) || /req\.pipe/.test(block);
    if (bodyIsStream) continue;
    const noBodyNeeded = !hasBodyAccess;

    if (noBodyNeeded) continue;

    const hasSafeParse = /\.safeParse\(/.test(block);
    const hasParse = /\.parse\(req\.body\)/.test(block);
    const hasZod = hasSafeParse || hasParse;

    let zodDetail = "none";
    if (hasSafeParse) {
      const schemaMatch = block.match(/(\w+)\.safeParse\(/);
      zodDetail = schemaMatch ? `${schemaMatch[1]}.safeParse()` : "safeParse()";
    } else if (hasParse) {
      zodDetail = ".parse()";
    }

    results.push({
      file: relPath,
      method,
      path: routePath,
      line: i + 1,
      hasZod,
      hasBodyAccess,
      zodDetail,
    });
  }

  return results;
}

function scanDir(dir: string): RouteInfo[] {
  const results: RouteInfo[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDir(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      results.push(...scanFile(full));
    }
  }

  return results;
}

const allRoutes = scanDir(ROUTES_DIR);
const validated = allRoutes.filter((r) => r.hasZod);
const unvalidated = allRoutes.filter((r) => !r.hasZod);

console.log("  Zod Validation Coverage Audit");
console.log("  ────────────────────────────────────────────");
console.log(`  Total body-accepting handlers:  ${allRoutes.length}`);
console.log(`  With Zod validation:            ${validated.length}`);
console.log(`  Without Zod validation:         ${unvalidated.length}`);
console.log(`  Coverage:                       ${((validated.length / allRoutes.length) * 100).toFixed(1)}%`);
console.log("  ────────────────────────────────────────────");

if (unvalidated.length > 0) {
  console.log("\n  MISSING VALIDATION:");
  for (const r of unvalidated) {
    console.log(`    ${r.method} ${r.path} (${r.file}:${r.line})`);
  }
}

console.log("\n  Validated handlers:");
for (const r of validated) {
  console.log(`    ✓ ${r.method} ${r.path} → ${r.zodDetail}`);
}

if (unvalidated.length > 0) {
  console.log(`\n  FAIL: ${unvalidated.length} handler(s) missing Zod validation`);
  process.exit(1);
} else {
  console.log("\n  ✓ PASS: 100% Zod coverage on all body-accepting handlers");
}
