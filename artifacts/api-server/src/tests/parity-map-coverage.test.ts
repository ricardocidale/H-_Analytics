/**
 * CI guard: every tool returned by getRebeccaTools() must appear in the
 * agent-native parity map. A missing row means the tool ships without
 * documented parity intent (✅, ⚠️, or 🚫 N/A).
 *
 * When this test fails, add a row to docs/discipline/agent-native-parity-map.md
 * for the tool before merging.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getRebeccaTools } from "../chat/rebecca-tool-definitions";

const PARITY_MAP = resolve(__dirname, "../../../../docs/discipline/agent-native-parity-map.md");

function extractMapMentions(markdown: string): Set<string> {
  // Collect all backtick-quoted identifiers (tool names appear as `tool_name`).
  // Pattern includes digits so names like `download_factory_v2_deck` are matched.
  const matches = [...markdown.matchAll(/`([a-z][a-z0-9_]*)`/g)];
  return new Set(matches.map((m) => m[1]));
}

describe("agent-native-parity-map coverage", () => {
  const toolNames = getRebeccaTools().map((t) => t.name);
  const mapMd = readFileSync(PARITY_MAP, "utf8");
  const mapMentions = extractMapMentions(mapMd);

  it("getRebeccaTools returns at least one tool", () => {
    expect(toolNames.length, "getRebeccaTools returned 0 tools").toBeGreaterThan(0);
  });

  it("parity map references every rebecca tool", () => {
    const missing = toolNames.filter((name) => !mapMentions.has(name));
    expect(missing, `Tools not in parity map: ${missing.join(", ")}`).toHaveLength(0);
  });
});
