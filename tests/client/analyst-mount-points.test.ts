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

  // --- Field-focus deep links (task #751) ----------------------------------
  // The resolver appends `?focus=<fieldId>` so the destination page's
  // `useFocusFieldFromUrl()` hook can scroll/focus the matching form field.

  it("appends ?focus=<fieldId> to property-edit hrefs when fieldId is provided", () => {
    const target = resolveFieldMountPoint("property-edit/capital-raise", {
      propertyId: 42,
      fieldId: "capitalRaise1Amount",
    });
    expect(target).not.toBeNull();
    expect(target!.href).toBe(
      "/property/42/edit?focus=capitalRaise1Amount#capital-raise",
    );
    target!.navigate();
    expect(navigateMock).toHaveBeenCalledWith(
      "/property/42/edit?focus=capitalRaise1Amount#capital-raise",
    );
  });

  it("appends ?focus=<fieldId> to defaults/* hrefs when fieldId is provided", () => {
    const target = resolveFieldMountPoint("defaults/revenue", {
      fieldId: "defaultRevShareFb",
    });
    expect(target).not.toBeNull();
    expect(target!.href).toBe(
      "/admin?focus=defaultRevShareFb#defaults-property/revenue",
    );
    target!.navigate();
    expect(setAdminSectionMock).toHaveBeenCalledWith("defaults-property");
    expect(navigateMock).toHaveBeenCalledWith(
      "/admin?focus=defaultRevShareFb#defaults-property/revenue",
    );
  });

  it("URL-encodes the focus fieldId so unusual characters don't corrupt the URL", () => {
    const target = resolveFieldMountPoint("property-edit/capital-raise", {
      propertyId: 1,
      fieldId: "weird field/name",
    });
    expect(target!.href).toBe(
      "/property/1/edit?focus=weird%20field%2Fname#capital-raise",
    );
  });

  it("omits the focus query when no fieldId is supplied", () => {
    const propertyTarget = resolveFieldMountPoint("property-edit/capital-raise", {
      propertyId: 1,
    });
    expect(propertyTarget!.href).toBe("/property/1/edit#capital-raise");
    const defaultsTarget = resolveFieldMountPoint("defaults/revenue");
    expect(defaultsTarget!.href).toBe("/admin#defaults-property/revenue");
  });

  // --- company-assumptions/<tab> slugs (task #760) -------------------------
  // The Company Assumptions page mirrors the active tab to `?tab=<key>`,
  // so company-scoped funding fields whose markers live in that page need
  // their mountPoint to land on `/company/assumptions?tab=funding`, not on
  // `/property/:id/edit` where their `data-field` markers don't exist.

  it("resolves a company-assumptions slug to the matching tab without requiring a propertyId", () => {
    const target = resolveFieldMountPoint("company-assumptions/funding");
    expect(target).not.toBeNull();
    expect(target!.href).toBe("/company/assumptions?tab=funding");
    target!.navigate();
    expect(navigateMock).toHaveBeenCalledWith("/company/assumptions?tab=funding");
  });

  it("appends ?focus=<fieldId> after the ?tab= param on company-assumptions hrefs", () => {
    const target = resolveFieldMountPoint("company-assumptions/funding", {
      fieldId: "capitalRaise1Amount",
    });
    expect(target).not.toBeNull();
    expect(target!.href).toBe(
      "/company/assumptions?tab=funding&focus=capitalRaise1Amount",
    );
    target!.navigate();
    expect(navigateMock).toHaveBeenCalledWith(
      "/company/assumptions?tab=funding&focus=capitalRaise1Amount",
    );
  });

  it("URL-encodes the focus fieldId for company-assumptions slugs", () => {
    const target = resolveFieldMountPoint("company-assumptions/funding", {
      fieldId: "weird field/name",
    });
    expect(target!.href).toBe(
      "/company/assumptions?tab=funding&focus=weird+field%2Fname",
    );
  });

  it("ignores propertyId for company-assumptions slugs (company-scoped surface)", () => {
    const target = resolveFieldMountPoint("company-assumptions/funding", {
      propertyId: 99,
      fieldId: "capitalRaise2Amount",
    });
    expect(target!.href).toBe(
      "/company/assumptions?tab=funding&focus=capitalRaise2Amount",
    );
  });

  // --- Named admin Defaults sections (task #765) ---------------------------
  // The three Defaults sub-sections (Management Company, Property,
  // Market & Macro) each have their own admin sidebar entry. The resolver
  // routes `defaults/<section-name>` slugs straight to the matching admin
  // section so a verdict on a CompanyTab field (e.g. `baseManagementFee`)
  // lands on the Management Company tab — not the Property tab where its
  // marker doesn't exist.

  it("resolves defaults/management-company to the management-company admin section", () => {
    const target = resolveFieldMountPoint("defaults/management-company", {
      fieldId: "baseManagementFee",
    });
    expect(target).not.toBeNull();
    expect(target!.href).toBe(
      "/admin?focus=baseManagementFee#defaults-management-company",
    );
    target!.navigate();
    expect(setAdminSectionMock).toHaveBeenCalledWith(
      "defaults-management-company",
    );
    expect(navigateMock).toHaveBeenCalledWith(
      "/admin?focus=baseManagementFee#defaults-management-company",
    );
  });

  it("resolves defaults/property to the property admin section", () => {
    const target = resolveFieldMountPoint("defaults/property", {
      fieldId: "defaultStartAdr",
    });
    expect(target).not.toBeNull();
    expect(target!.href).toBe(
      "/admin?focus=defaultStartAdr#defaults-property",
    );
    target!.navigate();
    expect(setAdminSectionMock).toHaveBeenCalledWith("defaults-property");
  });

  it("resolves defaults/market-macro to the market-macro admin section", () => {
    const target = resolveFieldMountPoint("defaults/market-macro", {
      fieldId: "inflationRate",
    });
    expect(target).not.toBeNull();
    expect(target!.href).toBe(
      "/admin?focus=inflationRate#defaults-market-macro",
    );
    target!.navigate();
    expect(setAdminSectionMock).toHaveBeenCalledWith("defaults-market-macro");
  });

  it("named-section defaults slugs resolve without a fieldId (no focus query)", () => {
    const target = resolveFieldMountPoint("defaults/management-company");
    expect(target!.href).toBe("/admin#defaults-management-company");
  });

  it("preserves the legacy defaults-property fallback for unknown sub-area slugs", () => {
    // `defaults/revenue` is the canonical legacy slug — not a sidebar
    // section name, just a sub-area within Property Defaults. Continues
    // to land on the property tab so existing entries don't regress.
    const target = resolveFieldMountPoint("defaults/revenue");
    expect(target!.href).toBe("/admin#defaults-property/revenue");
    target!.navigate();
    expect(setAdminSectionMock).toHaveBeenCalledWith("defaults-property");
  });
});
