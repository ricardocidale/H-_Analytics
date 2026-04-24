import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  SPECIALIST_TOOLS,
  SPECIALIST_TOOLS_VALID,
  LETICIA_SPECIALIST_ID,
  getSpecialistTool,
  getToolsByOwner,
} from "../../engine/analyst/registry/specialist-tools";
import { SPECIALIST_CATALOG } from "../../engine/analyst/registry/specialist-catalog";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

describe("SPECIALIST_TOOLS registry (Phase 2b inspectability)", () => {
  it("self-validates at module load", () => {
    expect(SPECIALIST_TOOLS_VALID).toBe(true);
  });

  it("registers at least the six Phase 2b deterministic capabilities", () => {
    const ids = SPECIALIST_TOOLS.map((t) => t.id);
    for (const expected of [
      "regulatory-profiles",
      "fred-reader",
      "vector-store-snapshots",
      "benchmark-snapshots",
      "finance-compute",
      "replicate-render-pipeline",
      "openai-image-fallback",
    ]) {
      expect(ids).toContain(expected);
    }
  });

  it("uses unique tool ids", () => {
    const ids = SPECIALIST_TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every tool at a real source file", () => {
    for (const tool of SPECIALIST_TOOLS) {
      const abs = path.join(REPO_ROOT, tool.sourceFile);
      expect(existsSync(abs), `${tool.id} → ${tool.sourceFile}`).toBe(true);
    }
  });

  it("attributes every tool to a registered Specialist", () => {
    const catalogIds = new Set(SPECIALIST_CATALOG.map((d) => d.id));
    for (const tool of SPECIALIST_TOOLS) {
      expect(catalogIds.has(tool.ownerSpecialistId), `${tool.id} owner ${tool.ownerSpecialistId}`).toBe(true);
      for (const calledById of tool.calledBy) {
        expect(catalogIds.has(calledById), `${tool.id} calledBy ${calledById}`).toBe(true);
      }
    }
  });

  it("defaults most tools to Letícia (Resource Builder)", () => {
    const leticia = getToolsByOwner(LETICIA_SPECIALIST_ID);
    expect(leticia.length).toBeGreaterThanOrEqual(4);
    const leticiaInCatalog = SPECIALIST_CATALOG.find((d) => d.id === LETICIA_SPECIALIST_ID);
    expect(leticiaInCatalog?.humanName).toBe("Letícia");
  });

  it("uses static dates that parse cleanly when source kind is 'static'", () => {
    for (const tool of SPECIALIST_TOOLS) {
      if (tool.lastBuiltSource.kind !== "static") continue;
      const d = new Date(tool.lastBuiltSource.isoDate);
      expect(Number.isNaN(d.getTime()), `${tool.id} isoDate ${tool.lastBuiltSource.isoDate}`).toBe(false);
    }
  });

  it("getSpecialistTool resolves by id", () => {
    expect(getSpecialistTool("regulatory-profiles")?.displayName).toBe("Regulatory Profiles");
    expect(getSpecialistTool("unknown")).toBeUndefined();
  });
});
