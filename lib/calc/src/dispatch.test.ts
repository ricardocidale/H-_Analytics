import { describe, it, expect } from "vitest";
import { executeComputationTool, isComputationTool } from "./dispatch.js";

describe("executeComputationTool()", () => {
  it("returns null for an unrecognised tool name", () => {
    expect(executeComputationTool("no_such_tool", {})).toBeNull();
  });

  it("returns a JSON result for a valid tool with valid input", () => {
    // Minimal valid DCF: one positive cash flow, positive discount rate
    const raw = executeComputationTool("calculate_dcf_npv", {
      cash_flows: [1000, 1000, 1000],
      discount_rate: 0.10,
    });
    expect(raw).not.toBeNull();
    const result = JSON.parse(raw!);
    expect(result).not.toHaveProperty("error");
    expect(typeof result.npv).toBe("number");
  });

  it("rejects malformed input with a Validation failed error (schema guard)", () => {
    // discount_rate must be positive; sending 0 violates z.number().positive()
    const raw = executeComputationTool("calculate_dcf_npv", {
      cash_flows: [1000],
      discount_rate: 0,
    });
    expect(raw).not.toBeNull();
    const result = JSON.parse(raw!);
    expect(result.error).toMatch(/Validation failed/);
  });

  it("rejects wrong-type input with a Validation failed error", () => {
    // cash_flows must be an array; sending a string triggers schema rejection
    const raw = executeComputationTool("calculate_dcf_npv", {
      cash_flows: "not-an-array",
      discount_rate: 0.10,
    });
    expect(raw).not.toBeNull();
    const result = JSON.parse(raw!);
    expect(result.error).toMatch(/Validation failed/);
  });

  it("rejects missing required fields with a Validation failed error", () => {
    // exit_valuation requires stabilized_noi and exit_cap_rate
    const raw = executeComputationTool("exit_valuation", {
      exit_cap_rate: 0.06,
      // missing stabilized_noi
    });
    expect(raw).not.toBeNull();
    const result = JSON.parse(raw!);
    expect(result.error).toMatch(/Validation failed/);
  });

  it("validates compute_adr_projection and rejects negative projection_years", () => {
    const raw = executeComputationTool("compute_adr_projection", {
      start_adr: 100,
      growth_rate: 0.05,
      projection_years: -1,
    });
    expect(raw).not.toBeNull();
    const result = JSON.parse(raw!);
    expect(result.error).toMatch(/Validation failed/);
  });

  it("accepts compute_adr_projection with zero start_adr and returns non-Infinity values", () => {
    // Regression guard for the zero-division guard on adr_growth_from_start
    const raw = executeComputationTool("compute_adr_projection", {
      start_adr: 0,
      growth_rate: 0.10,
      projection_years: 2,
    });
    expect(raw).not.toBeNull();
    const result = JSON.parse(raw!);
    expect(result).not.toHaveProperty("error");
    for (const proj of result.projections) {
      expect(proj.adr_growth_from_start).toBe("0%");
    }
  });

  it("validates compute_mirr and rejects vectors with fewer than 2 elements", () => {
    const raw = executeComputationTool("compute_mirr", {
      cash_flow_vector: [-1000],
      finance_rate: 0.10,
      reinvestment_rate: 0.12,
    });
    expect(raw).not.toBeNull();
    const result = JSON.parse(raw!);
    // mirrSchema requires min(2) elements — schema rejects before function runs
    expect(result.error).toMatch(/Validation failed/);
  });
});

describe("isComputationTool()", () => {
  it("returns true for registered tools", () => {
    expect(isComputationTool("calculate_dcf_npv")).toBe(true);
    expect(isComputationTool("compute_mirr")).toBe(true);
    expect(isComputationTool("compute_make_vs_buy")).toBe(true);
  });

  it("returns false for unregistered names", () => {
    expect(isComputationTool("does_not_exist")).toBe(false);
    expect(isComputationTool("")).toBe(false);
  });
});
