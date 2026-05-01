import { describe, it, expect } from "vitest";
import { buildRAGContext } from "../../server/ai/knowledge-base";

describe("Knowledge Base — RAG Context Builder", () => {
  it("returns empty string for empty chunks", () => {
    expect(buildRAGContext([])).toBe("");
  });

  it("builds context with header and sections", () => {
    const chunks = [
      { title: "Revenue", content: "Room revenue is calculated...", source: "Manual", score: 0.9 },
      { title: "Expenses", content: "USALI standard categories...", source: "Manual", score: 0.8 },
    ];
    const result = buildRAGContext(chunks);
    expect(result).toContain("## Relevant Knowledge Base Context");
    expect(result).toContain("### Revenue (Manual)");
    expect(result).toContain("### Expenses (Manual)");
    expect(result).toContain("Room revenue is calculated...");
    expect(result).toContain("USALI standard categories...");
  });

  it("respects MAX_RAG_CONTEXT_CHARS limit", () => {
    const longContent = "x".repeat(3000);
    const chunks = [
      { title: "A", content: longContent, source: "S", score: 0.9 },
      { title: "B", content: longContent, source: "S", score: 0.8 },
    ];
    const result = buildRAGContext(chunks);
    expect(result).toContain("### A (S)");
    expect(result.length).toBeLessThan(4500);
  });

  it("includes source attribution in section headers", () => {
    const chunks = [
      { title: "DSCR", content: "Debt service coverage...", source: "Checker Manual", score: 0.7 },
    ];
    const result = buildRAGContext(chunks);
    expect(result).toContain("### DSCR (Checker Manual)");
  });
});
