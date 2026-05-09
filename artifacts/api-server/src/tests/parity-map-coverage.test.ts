/**
 * CI guard: every tool exported by rebecca-tools.ts must appear in the
 * agent-native parity map. A missing row means the tool ships without
 * documented parity intent (✅, ⚠️, or 🚫 N/A).
 *
 * When this test fails, add a row to docs/discipline/agent-native-parity-map.md
 * for the tool before merging.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const TOOLS_FILE = resolve(__dirname, "../../src/chat/rebecca-tools.ts");
const PARITY_MAP = resolve(__dirname, "../../../../docs/discipline/agent-native-parity-map.md");

function extractToolNames(source: string): string[] {
  const matches = [...source.matchAll(/^\s+name:\s+"([^"]+)"/gm)];
  return matches.map((m) => m[1]);
}

function extractMapMentions(markdown: string): Set<string> {
  // Collect all backtick-quoted identifiers (tool names appear as `tool_name`)
  const matches = [...markdown.matchAll(/`([a-z_]+)`/g)];
  return new Set(matches.map((m) => m[1]));
}

describe("agent-native-parity-map coverage", () => {
  const toolsSrc = readFileSync(TOOLS_FILE, "utf8");
  const mapMd = readFileSync(PARITY_MAP, "utf8");

  const toolNames = extractToolNames(toolsSrc);
  const mapMentions = extractMapMentions(mapMd);

  it("extractToolNames returns at least one tool", () => {
    expect(toolNames.length, "extractToolNames returned 0 — regex may have drifted from rebecca-tools.ts format").toBeGreaterThan(0);
  });

  it("parity map references every rebecca tool", () => {
    const missing = toolNames.filter((name) => !mapMentions.has(name));
    expect(missing, `Tools not in parity map: ${missing.join(", ")}`).toHaveLength(0);
  });
});
