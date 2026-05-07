/**
 * Carlo minion — Zod schema validation tests.
 *
 * Carlo is a pure function: runCarlo(blocksBySlide) → CarloValidationResult.
 * No LLM, no DB, no I/O. Tests can run fully offline.
 */
import { describe, it, expect } from "vitest";
import { runCarlo } from "../slides/minions/carlo";
import type { LorenzoTextBlock } from "../slides/canonical-spec-types";

function makeBlock(overrides: Partial<LorenzoTextBlock> = {}): LorenzoTextBlock {
  return {
    text: "Sample text",
    x: 10,
    y: 20,
    w: 100,
    h: 20,
    slideIndex: 0,
    fontName: "Georgia, serif",
    fontSize: 16,
    fontWeight: 700,
    color: "#257D41",
    semanticRole: "slide_title",
    variableBinding: null,
    overflowBehavior: null,
    characterCount: 11,
    ...overrides,
  };
}

describe("runCarlo", () => {
  it("returns valid=true for a well-formed blocksBySlide", () => {
    const result = runCarlo([[makeBlock()]]);
    expect(result.valid).toBe(true);
    expect(result.blockingErrors).toHaveLength(0);
  });

  it("accepts null variableBinding and overflowBehavior", () => {
    const result = runCarlo([[makeBlock({ variableBinding: null, overflowBehavior: null })]]);
    expect(result.valid).toBe(true);
  });

  it("accepts a non-null variableBinding", () => {
    const result = runCarlo([[makeBlock({ variableBinding: "slide1.headerSubtitle" })]]);
    expect(result.valid).toBe(true);
  });

  it("rejects a block with empty text", () => {
    const result = runCarlo([[makeBlock({ text: "" })]]);
    expect(result.valid).toBe(false);
    expect(result.blockingErrors.some((e) => e.includes("text"))).toBe(true);
  });

  it("rejects a block with non-hex color", () => {
    const result = runCarlo([[makeBlock({ color: "green" })]]);
    expect(result.valid).toBe(false);
    expect(result.blockingErrors.some((e) => e.includes("color"))).toBe(true);
  });

  it("rejects a block with font weight below 100", () => {
    const result = runCarlo([[makeBlock({ fontWeight: 50 })]]);
    expect(result.valid).toBe(false);
    expect(result.blockingErrors.some((e) => e.includes("fontWeight"))).toBe(true);
  });

  it("rejects a block with font weight above 900", () => {
    const result = runCarlo([[makeBlock({ fontWeight: 1000 })]]);
    expect(result.valid).toBe(false);
    expect(result.blockingErrors.some((e) => e.includes("fontWeight"))).toBe(true);
  });

  it("rejects a block with negative fontSize", () => {
    const result = runCarlo([[makeBlock({ fontSize: -1 })]]);
    expect(result.valid).toBe(false);
    expect(result.blockingErrors.some((e) => e.includes("fontSize"))).toBe(true);
  });

  it("reports blockingErrors paths with slide and block indices", () => {
    const result = runCarlo([[makeBlock(), makeBlock({ color: "not-hex" })], [makeBlock()]]);
    expect(result.valid).toBe(false);
    expect(result.blockingErrors[0]).toMatch(/blocksBySlide\[0\]\[1\]/);
  });

  it("returns valid=true for empty blocksBySlide", () => {
    const result = runCarlo([]);
    expect(result.valid).toBe(true);
  });

  it("flags a non-array slide entry as a blocking error", () => {
    const result = runCarlo(["not an array" as unknown as unknown[]]);
    expect(result.valid).toBe(false);
    expect(result.blockingErrors[0]).toMatch(/blocksBySlide\[0\]/);
  });

  it("validates a full overflowBehavior object", () => {
    const result = runCarlo([[makeBlock({
      overflowBehavior: {
        mode: "preserve_bbox_wrap_then_shrink",
        maxFontSizeDeltaPct: -18,
        maxLineHeightDeltaPct: -12,
        truncateAllowed: false,
      },
    })]]);
    expect(result.valid).toBe(true);
  });
});
