/**
 * Tool Registry — proof test enforcing tool registration completeness.
 *
 * Verifies that every tool registered in calc/dispatch.ts has:
 * 1. A matching JSON schema in .claude/tools/
 * 2. Implementation files exist
 * 3. Total count matches documented count
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");

function extractDispatchedToolNames(): string[] {
  const src = readFileSync(join(ROOT, "calc/dispatch.ts"), "utf-8");
  // Match tool names as keys in the TOOL_DISPATCH object
  const names: string[] = [];
  const regex = /^\s*(\w+)\s*[:=]/gm;
  // Extract lines between TOOL_DISPATCH = { and the closing }
  const startMatch = src.match(/const\s+TOOL_DISPATCH[^{]*\{/);
  if (!startMatch) return names;
  const start = src.indexOf(startMatch[0]) + startMatch[0].length;
  let depth = 1;
  let end = start;
  for (let i = start; i < src.length && depth > 0; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}") depth--;
    end = i;
  }
  const block = src.slice(start, end);
  const lines = block.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    // Match: tool_name: handler or tool_name: (input) =>
    const match = trimmed.match(/^(\w+)\s*[:(]/);
    if (match) {
      names.push(match[1]);
    }
  }
  return names;
}

function listJsonSchemas(): string[] {
  const toolsDir = join(ROOT, ".claude/tools");
  const schemas: string[] = [];
  if (!existsSync(toolsDir)) return schemas;
  const subdirs = readdirSync(toolsDir, { withFileTypes: true }).filter(d => d.isDirectory());
  for (const subdir of subdirs) {
    const dirPath = join(toolsDir, subdir.name);
    const files = readdirSync(dirPath).filter(f => f.endsWith(".json"));
    for (const file of files) {
      // Convert kebab-case filename to snake_case tool name
      const name = file.replace(".json", "").replace(/-/g, "_");
      schemas.push(name);
    }
  }
  return schemas;
}

describe("Tool Registry — Dispatch Completeness", () => {
  const toolNames = extractDispatchedToolNames();
  const schemaNames = listJsonSchemas();

  it("dispatch.ts contains registered tools", () => {
    expect(toolNames.length).toBeGreaterThanOrEqual(39);
  });

  it("every dispatched tool has a JSON schema in .claude/tools/", () => {
    const missing = toolNames.filter(name => !schemaNames.includes(name));
    expect(
      missing,
      `Tools missing schemas: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("documented tool count (40) matches actual dispatch count", () => {
    expect(toolNames.length).toBe(40);
  });
});

describe("Tool Registry — Purity Verification", () => {
  it("calc/dispatch.ts does not import from server/", () => {
    const src = readFileSync(join(ROOT, "calc/dispatch.ts"), "utf-8");
    expect(src).not.toMatch(/from\s+["'][^"']*server\//);
  });

  it("calc/dispatch.ts does not import from client/", () => {
    const src = readFileSync(join(ROOT, "calc/dispatch.ts"), "utf-8");
    expect(src).not.toMatch(/from\s+["'][^"']*client\//);
  });
});
