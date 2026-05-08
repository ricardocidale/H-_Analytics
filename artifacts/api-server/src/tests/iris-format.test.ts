import { describe, it, expect } from "vitest";
import { capErrors, IRIS_HEALTH_SUMMARY_MAX_ERRORS } from "../ai/iris/format";

describe("capErrors", () => {
  it("returns undefined when input is undefined", () => {
    expect(capErrors(undefined, 50)).toBeUndefined();
  });

  it("returns empty array unchanged", () => {
    expect(capErrors([], 50)).toEqual([]);
  });

  it("returns array unchanged when length < limit", () => {
    const input = ["a", "b", "c"];
    expect(capErrors(input, 10)).toEqual(["a", "b", "c"]);
  });

  it("returns array unchanged when length === limit (boundary: <= not <)", () => {
    const input = Array.from({ length: 50 }, (_, i) => `error-${i}`);
    const result = capErrors(input, 50);
    expect(result).toHaveLength(50);
    expect(result).toEqual(input);
  });

  it("truncates to limit entries plus sentinel when length > limit", () => {
    const input = Array.from({ length: 51 }, (_, i) => `error-${i}`);
    const result = capErrors(input, 50)!;
    expect(result).toHaveLength(51);
    expect(result[50]).toBe("... and 1 more");
    expect(result.slice(0, 50)).toEqual(input.slice(0, 50));
  });

  it("sentinel counts excess correctly for large overflows", () => {
    const input = Array.from({ length: 100 }, (_, i) => `error-${i}`);
    const result = capErrors(input, 50)!;
    expect(result).toHaveLength(51);
    expect(result[50]).toBe("... and 50 more");
  });

  it("IRIS_HEALTH_SUMMARY_MAX_ERRORS is exported and equals 50", () => {
    expect(IRIS_HEALTH_SUMMARY_MAX_ERRORS).toBe(50);
  });
});
