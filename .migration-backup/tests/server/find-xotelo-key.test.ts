import { describe, it, expect } from "vitest";
import { findXoteloKey } from "../../server/routes/property-finder";

describe("findXoteloKey", () => {
  it("resolves direct full-string match", () => {
    const result = findXoteloKey("miami, fl");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("g34438");
  });

  it("resolves Portland, OR correctly", () => {
    const result = findXoteloKey("Portland, OR");
    expect(result).not.toBeNull();
    expect(result!.key).not.toBe(findXoteloKey("Portland, ME")?.key);
  });

  it("resolves Portland, ME correctly (not Oregon)", () => {
    const result = findXoteloKey("Portland, ME");
    expect(result).not.toBeNull();
    expect(result!.key).not.toBe(findXoteloKey("Portland, OR")?.key);
  });

  it("falls back to city-only when no state provided", () => {
    const result = findXoteloKey("Asheville");
    expect(result).not.toBeNull();
    expect(result!.label).toContain("asheville");
  });

  it("returns null for unknown city", () => {
    const result = findXoteloKey("Nonexistent City, ZZ");
    expect(result).toBeNull();
  });

  it("is case-insensitive", () => {
    const result = findXoteloKey("MIAMI, FL");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("g34438");
  });
});
