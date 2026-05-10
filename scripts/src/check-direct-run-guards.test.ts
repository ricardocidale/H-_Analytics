import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { scanFile } from "./check-direct-run-guards.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tmpFiles: string[] = [];

function writeTmp(name: string, content: string): string {
  const filePath = path.join(os.tmpdir(), `drg-test-${Date.now()}-${name}`);
  fs.writeFileSync(filePath, content, "utf8");
  tmpFiles.push(filePath);
  return filePath;
}

afterEach(() => {
  for (const f of tmpFiles.splice(0)) {
    try {
      fs.unlinkSync(f);
    } catch {
      // ignore
    }
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scanFile — direct-run guard checker", () => {
  it("returns no violations for a clean file", () => {
    const file = writeTmp(
      "clean.ts",
      `
import path from "node:path";

function main() {
  console.log("hello");
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  /my-script\\.[jt]s(x?)$/.test(process.argv[1]);

if (isDirectRun) { main(); }
`,
    );

    expect(scanFile(file)).toHaveLength(0);
  });

  it("flags a same-line broken pattern (import.meta.url + pathToFileURL on one line)", () => {
    const file = writeTmp(
      "same-line.ts",
      `
import { pathToFileURL } from "node:url";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
`,
    );

    const violations = scanFile(file);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].reason).toMatch(/same-line/);
  });

  it("flags a multi-line broken pattern (import.meta.url and pathToFileURL on separate lines)", () => {
    const file = writeTmp(
      "multi-line.ts",
      `
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const fileUrl = import.meta.url;
const argUrl = pathToFileURL(resolve(process.argv[1])).href;

if (fileUrl === argUrl) {
  main();
}
`,
    );

    const violations = scanFile(file);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].reason).toMatch(/multi-line/);
  });

  it("skips the pattern when it appears only in a line comment", () => {
    const file = writeTmp(
      "in-comment.ts",
      `
// Bad old pattern: import.meta.url === pathToFileURL(process.argv[1]).href
// Do NOT use the above — it breaks when bundled with esbuild.

const isDirectRun =
  Boolean(process.argv[1]) &&
  /my-script\\.[jt]s(x?)$/.test(process.argv[1]);
`,
    );

    expect(scanFile(file)).toHaveLength(0);
  });

  it("skips the pattern when it appears only in a block comment", () => {
    const file = writeTmp(
      "in-block-comment.ts",
      `
/**
 * Previously used:
 *   import.meta.url === pathToFileURL(resolve(process.argv[1])).href
 * This is bundle-unsafe. Use argv regex instead.
 */
const isDirectRun =
  Boolean(process.argv[1]) &&
  /my-script\\.[jt]s(x?)$/.test(process.argv[1]);
`,
    );

    expect(scanFile(file)).toHaveLength(0);
  });

  it("accepts the canonical safe argv-regex direct-run guard pattern", () => {
    const file = writeTmp(
      "safe-guard.ts",
      `
function main() {
  console.log("running");
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  /check-direct-run-guards\\.[jt]s(x?)$/.test(process.argv[1]);

if (isDirectRun) { main(); }
`,
    );

    expect(scanFile(file)).toHaveLength(0);
  });
});
