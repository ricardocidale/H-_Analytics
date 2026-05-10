import { describe, it, expect } from "vitest";
import { resolveResponseMode } from "../routes/chat-llm";

describe("resolveResponseMode", () => {
  it("returns body value when provided", () => {
    expect(resolveResponseMode("concise", "detailed")).toBe("concise");
    expect(resolveResponseMode("detailed", "concise")).toBe("detailed");
  });

  it("falls back to DB pref when body is undefined", () => {
    expect(resolveResponseMode(undefined, "concise")).toBe("concise");
    expect(resolveResponseMode(undefined, "detailed")).toBe("detailed");
  });

  it("defaults to standard when both are absent", () => {
    expect(resolveResponseMode(undefined, null)).toBe("standard");
    expect(resolveResponseMode(undefined, undefined)).toBe("standard");
  });

  it("rejects invalid DB values and defaults to standard", () => {
    expect(resolveResponseMode(undefined, "verbose")).toBe("standard");
    expect(resolveResponseMode(undefined, "")).toBe("standard");
  });

  it("body value wins over invalid DB value", () => {
    expect(resolveResponseMode("detailed", "garbage")).toBe("detailed");
  });

  it("accepts all three valid modes from body", () => {
    expect(resolveResponseMode("concise", undefined)).toBe("concise");
    expect(resolveResponseMode("standard", undefined)).toBe("standard");
    expect(resolveResponseMode("detailed", undefined)).toBe("detailed");
  });

  it("ignores null DB value and returns standard", () => {
    expect(resolveResponseMode(undefined, null)).toBe("standard");
  });

  it("ignores whitespace-only DB value and returns standard", () => {
    expect(resolveResponseMode(undefined, "   ")).toBe("standard");
  });
});
