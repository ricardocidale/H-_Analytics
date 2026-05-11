/**
 * Minion self-test registry tests (Task #1392).
 *
 * Each minion's self-test must:
 *   - Be registered in MINION_SELF_TESTS
 *   - Return a valid status verdict (`pass` | `fail` | `skipped`)
 *   - Run quickly (< 10s — generous bound for the Aldo PDF path)
 *
 * Aldo runs `pdftotext`, which is provided by Poppler in the Replit/Nix
 * environment and the production Docker image. If it ever stops being
 * available, this test will surface it loudly.
 */
import { describe, it, expect } from "vitest";
import { MINION_SELF_TESTS, runMinionSelfTest } from "../slides/minions/self-tests";

describe("minion self-tests", () => {
  it("has a self-test registered for every catalog minion", () => {
    expect(Object.keys(MINION_SELF_TESTS).sort()).toEqual(
      ["aldo", "carlo", "dino", "enzo"].sort(),
    );
  });

  it("returns a structured fail for an unknown minion", async () => {
    const result = await runMinionSelfTest("nobody");
    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/no self-test registered/i);
  });

  it("carlo passes against its known fixture", async () => {
    const result = await runMinionSelfTest("carlo");
    expect(result.status).toBe("pass");
  });

  it("enzo passes against its known fixture", async () => {
    const result = await runMinionSelfTest("enzo");
    expect(result.status).toBe("pass");
  });

  it("dino passes against in-memory PNG fixtures", async () => {
    const result = await runMinionSelfTest("dino");
    expect(result.status).toBe("pass");
  });

  it("aldo passes against an in-memory jsPDF fixture", async () => {
    const result = await runMinionSelfTest("aldo");
    expect(result.status).toBe("pass");
    const generousBoundMs = 10_000;
    expect(result.durationMs).toBeLessThan(generousBoundMs);
  }, 15_000);
});
