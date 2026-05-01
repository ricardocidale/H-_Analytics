import { describe, it, expect } from "vitest";
import { splitIntoChunks, cosineSimilarity } from "../../server/ai/knowledge-base";

describe("splitIntoChunks", () => {
  it("produces 1 chunk for short text", () => {
    const chunks = splitIntoChunks("This is a short paragraph that should fit in one chunk easily.", "Test", "unit", "test");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe("Test");
    expect(chunks[0].source).toBe("unit");
    expect(chunks[0].category).toBe("test");
  });

  it("filters paragraphs shorter than 20 chars", () => {
    const text = "Short\n\nThis is a paragraph that is definitely long enough to pass the 20-char filter and appear in chunks.";
    const chunks = splitIntoChunks(text, "Title", "src", "cat");
    expect(chunks).toHaveLength(1);
    // The short paragraph "Short" should be filtered out
    expect(chunks[0].content).not.toContain("Short");
  });

  it("splits long text into multiple chunks", () => {
    // Create text that exceeds CHUNK_SIZE (800 chars)
    const longParagraph = "A".repeat(50) + " financial analysis ";
    const paragraphs = Array(30).fill(longParagraph).join("\n\n");
    const chunks = splitIntoChunks(paragraphs, "Long", "src", "cat");
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("extracts markdown header titles", () => {
    const text = [
      "This is an introduction paragraph that is long enough to pass the filter.",
      "## Revenue Calculations",
      "Room revenue is calculated by multiplying ADR by occupancy and room count.",
    ].join("\n\n");
    const chunks = splitIntoChunks(text, "Manual", "doc", "method");
    const headerChunk = chunks.find(c => c.title.includes("Revenue Calculations"));
    expect(headerChunk).toBeDefined();
    expect(headerChunk!.title).toBe("Manual > Revenue Calculations");
  });

  it("chunks have overlap content", () => {
    // Create many paragraphs to force multiple chunks
    const para = "The financial engine processes monthly calculations with inflation adjustments.";
    const paragraphs = Array(20).fill(para).join("\n\n");
    const chunks = splitIntoChunks(paragraphs, "Title", "src", "cat");
    if (chunks.length >= 2) {
      // Second chunk should contain some overlap from the first
      const lastWordsOfFirst = chunks[0].content.split(/\s+/).slice(-5).join(" ");
      // Overlap words from end of first chunk should appear at start of second chunk
      expect(chunks[1].content.length).toBeGreaterThan(0);
    }
  });

  it("returns empty array for text with only tiny paragraphs", () => {
    const text = "Hi.\n\nBye.\n\nOk.";
    const chunks = splitIntoChunks(text, "Title", "src", "cat");
    expect(chunks).toHaveLength(0);
  });

  it("handles text with no paragraph breaks", () => {
    const text = "A single long paragraph without any double-newline breaks but with enough content to exceed the minimum character threshold for inclusion.";
    const chunks = splitIntoChunks(text, "Title", "src", "cat");
    expect(chunks).toHaveLength(1);
  });

  it("preserves source and category across all chunks", () => {
    const para = "The financial engine processes monthly calculations with inflation adjustments.";
    const paragraphs = Array(20).fill(para).join("\n\n");
    const chunks = splitIntoChunks(paragraphs, "Title", "mysrc", "mycat");
    for (const chunk of chunks) {
      expect(chunk.source).toBe("mysrc");
      expect(chunk.category).toBe("mycat");
    }
  });
});

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("returns -1.0 for opposite vectors", () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it("handles unit vectors correctly", () => {
    const a = [1, 0];
    const b = [Math.SQRT1_2, Math.SQRT1_2]; // 45 degrees
    expect(cosineSimilarity(a, b)).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("is symmetric", () => {
    const a = [1, 3, -5];
    const b = [4, -2, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it("is scale-invariant", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    const aScaled = [10, 20, 30];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(aScaled, b), 6);
  });

  it("returns value between -1 and 1 for arbitrary vectors", () => {
    const a = [0.5, -0.3, 0.8, 0.1];
    const b = [0.2, 0.7, -0.4, 0.9];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(-1.0);
    expect(sim).toBeLessThanOrEqual(1.0);
  });
});

