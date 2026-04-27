import { describe, it, expect, vi, beforeEach } from "vitest";

// wouter's use-browser-location pulls in browser globals; stub the navigate
// import surface so the resolver can be called in a node test context. The
// stub also lets us assert the navigation behavior directly.
const navigateMock = vi.fn();
vi.mock("wouter/use-browser-location", () => ({
  navigate: (...args: unknown[]) => navigateMock(...args),
}));

const setAdminSectionMock = vi.fn();
vi.mock("@/lib/admin-nav", () => ({
  setAdminSection: (...args: unknown[]) => setAdminSectionMock(...args),
}));

import { resolveFieldMountPoint } from "@/lib/analyst-mount-points";

describe("resolveFieldMountPoint", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    setAdminSectionMock.mockReset();
  });

  it("returns null for an unknown slug", () => {
    expect(resolveFieldMountPoint("not-a-slug")).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(resolveFieldMountPoint("")).toBeNull();
  });

  it("returns null for a property-edit slug when no propertyId is in scope", () => {
    expect(resolveFieldMountPoint("property-edit/capital-raise")).toBeNull();
  });

  it("resolves a property-edit slug with a string propertyId to a hashed deep link", () => {
    const target = resolveFieldMountPoint("property-edit/capital-raise", {
      propertyId: "abc-123",
    });
    expect(target).not.toBeNull();
    expect(target!.href).toBe("/property/abc-123/edit#capital-raise");
    target!.navigate();
    expect(navigateMock).toHaveBeenCalledWith("/property/abc-123/edit#capital-raise");
  });

  it("resolves a property-edit slug with a numeric propertyId", () => {
    const target = resolveFieldMountPoint("property-edit/capital-raise", {
      propertyId: 42,
    });
    expect(target!.href).toBe("/property/42/edit#capital-raise");
  });

  it("resolves a defaults/* slug to the property-defaults admin section", () => {
    const target = resolveFieldMountPoint("defaults/revenue");
    expect(target).not.toBeNull();
    expect(target!.href).toBe("/admin#defaults-property/revenue");
    target!.navigate();
    expect(setAdminSectionMock).toHaveBeenCalledWith("defaults-property");
  });

  it("does not require propertyId for defaults/* slugs", () => {
    const target = resolveFieldMountPoint("defaults/revenue");
    expect(target).not.toBeNull();
  });

  it("treats an empty propertyId string as missing context", () => {
    expect(
      resolveFieldMountPoint("property-edit/capital-raise", { propertyId: "" }),
    ).toBeNull();
  });
});
