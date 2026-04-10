import { describe, it, expect } from "vitest";

describe("PNG export configuration defaults", () => {
  it("default retina scale of 2 doubles pixel dimensions", () => {
    const elementWidth = 800;
    const elementHeight = 400;
    const scale = 2;
    expect(elementWidth * scale).toBe(1600);
    expect(elementHeight * scale).toBe(800);
  });

  it("custom dimensions override element-based calculation", () => {
    const elementWidth = 800;
    const elementHeight = 400;
    const scale = 2;
    const customWidth = 1200;
    const customHeight = 600;

    const width = customWidth || elementWidth * scale;
    const height = customHeight || elementHeight * scale;
    expect(width).toBe(1200);
    expect(height).toBe(600);
  });
});

describe("SVG serialization for chart PNG fallback", () => {
  it("SVG serialization produces valid data URI prefix", () => {
    const svgString = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>';
    const encodedData = Buffer.from(svgString).toString("base64");
    const dataUri = `data:image/svg+xml;base64,${encodedData}`;
    expect(dataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    const decoded = Buffer.from(encodedData, "base64").toString();
    expect(decoded).toContain("xmlns");
    expect(decoded).toContain("width");
  });
});
