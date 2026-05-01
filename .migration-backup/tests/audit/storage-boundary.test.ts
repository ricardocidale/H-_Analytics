import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Storage Boundary — ensures no direct `db` imports outside the storage layer.
 *
 * All database access should go through server/storage/ to maintain the
 * abstraction layer, enable audit trails, and keep query logic centralized.
 *
 * Allowed: server/storage/*.ts, server/db.ts, server/migrations/*.ts
 * Forbidden: server/ai/*.ts, server/routes/*.ts, server/services/*.ts
 */

function findTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      results.push(full);
    }
  }
  return results;
}

const SERVER_ROOT = path.resolve(__dirname, "../../server");

// Directories that must NOT import from "../db" or "../../db"
const FORBIDDEN_DIRS = [
  path.join(SERVER_ROOT, "ai"),
  path.join(SERVER_ROOT, "routes"),
  path.join(SERVER_ROOT, "services"),
];

// Import patterns that indicate direct DB access
const DB_IMPORT_PATTERNS = [
  /from\s+["'][.\/]*db["']/,            // from "../db" or from "./db"
  /from\s+["']\.\.\/db["']/,            // from "../db"
  /from\s+["']\.\.\/\.\.\/db["']/,      // from "../../db"
  /require\(["'][.\/]*db["']\)/,        // require("../db")
];

describe("Storage Boundary — no direct db imports outside storage layer", () => {
  for (const dir of FORBIDDEN_DIRS) {
    const files = findTsFiles(dir);
    const dirName = path.relative(SERVER_ROOT, dir);

    for (const file of files) {
      const rel = path.relative(SERVER_ROOT, file);
      it(`${rel}: does not import db directly`, () => {
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");
        const violations: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trimStart().startsWith("//")) continue;
          for (const pattern of DB_IMPORT_PATTERNS) {
            if (pattern.test(line)) {
              violations.push(`  line ${i + 1}: ${line.trim()}`);
            }
          }
        }

        if (violations.length > 0) {
          expect.fail(
            `${rel} imports db directly (use storage layer instead):\n${violations.join("\n")}`
          );
        }
      });
    }
  }
});

describe("Route Parameter Safety — no raw parseInt on req.params", () => {
  const routeFiles = findTsFiles(path.join(SERVER_ROOT, "routes"));

  for (const file of routeFiles) {
    const rel = path.relative(SERVER_ROOT, file);
    it(`${rel}: uses parseRouteId instead of parseInt(req.params.*)`, () => {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      const violations: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith("//")) continue;
        if (/parseInt\(.*req\.params/.test(line)) {
          violations.push(`  line ${i + 1}: ${line.trim()}`);
        }
      }

      if (violations.length > 0) {
        expect.fail(
          `${rel} uses raw parseInt on req.params (use parseRouteId instead):\n${violations.join("\n")}`
        );
      }
    });
  }
});
