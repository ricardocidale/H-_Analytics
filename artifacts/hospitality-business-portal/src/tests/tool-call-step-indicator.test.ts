import { describe, it, expect } from "vitest";
import {
  toolToPersona,
  toolFriendlyName,
  formatElapsed,
} from "../components/rebecca/ToolCallStepIndicator";

// ---------------------------------------------------------------------------
// toolToPersona
// ---------------------------------------------------------------------------
describe("toolToPersona", () => {
  it("maps Slide Factory tools to 'marco'", () => {
    expect(toolToPersona("produce_slide_factory_deck")).toBe("marco");
    expect(toolToPersona("trigger_slide_factory_build")).toBe("marco");
    expect(toolToPersona("trigger_lb_deck_render")).toBe("marco");
    expect(toolToPersona("cancel_slide_factory_build")).toBe("marco");
  });

  it("maps Iris tools to 'iris'", () => {
    expect(toolToPersona("trigger_iris_health_check")).toBe("iris");
    expect(toolToPersona("get_iris_status")).toBe("iris");
    expect(toolToPersona("clear_iris_gaps")).toBe("iris");
  });

  it("maps Gustavo tools to 'gustavo'", () => {
    expect(toolToPersona("trigger_research")).toBe("gustavo");
    expect(toolToPersona("refresh_analyst_table")).toBe("gustavo");
  });

  it("falls back to 'rebecca' for unknown tool names", () => {
    expect(toolToPersona("list_properties")).toBe("rebecca");
    expect(toolToPersona("update_scenario")).toBe("rebecca");
    expect(toolToPersona("some_future_tool")).toBe("rebecca");
    expect(toolToPersona("")).toBe("rebecca");
  });
});

// ---------------------------------------------------------------------------
// toolFriendlyName
// ---------------------------------------------------------------------------
describe("toolFriendlyName", () => {
  it("returns the mapped label for known tool names", () => {
    expect(toolFriendlyName("list_properties")).toBe("Listing properties");
    expect(toolFriendlyName("trigger_research")).toBe("Running research");
    expect(toolFriendlyName("produce_slide_factory_deck")).toBe("Building investor deck");
  });

  it("falls back to underscore-to-space for unknown names", () => {
    expect(toolFriendlyName("some_unknown_tool")).toBe("some unknown tool");
    expect(toolFriendlyName("a_brand_new_future_tool")).toBe("a brand new future tool");
  });

  it("handles empty string without throwing", () => {
    expect(toolFriendlyName("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatElapsed
// ---------------------------------------------------------------------------
describe("formatElapsed", () => {
  it("formats sub-second durations to one decimal place", () => {
    expect(formatElapsed(800)).toBe("0.8 s");
    expect(formatElapsed(100)).toBe("0.1 s");
  });

  it("formats multi-second durations correctly", () => {
    expect(formatElapsed(1000)).toBe("1.0 s");
    expect(formatElapsed(1234)).toBe("1.2 s");
    expect(formatElapsed(9999)).toBe("10.0 s");
  });

  it("rounds to one decimal — 1500ms → 1.5 s, 1550ms → 1.6 s", () => {
    expect(formatElapsed(1500)).toBe("1.5 s");
    expect(formatElapsed(1550)).toBe("1.6 s");
  });

  it("formats zero", () => {
    expect(formatElapsed(0)).toBe("0.0 s");
  });
});
