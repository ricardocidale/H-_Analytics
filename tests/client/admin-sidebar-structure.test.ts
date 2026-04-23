/**
 * Snapshot test for the Admin sidebar structure (Task #447).
 *
 * Locks in the canonical shape produced by `buildNavGroups()` so a future
 * edit cannot silently re-introduce a single-item duplicate-label group,
 * rename "Financial Defaults" back to engineering jargon, or move
 * Activity out of App Settings without tripping a test.
 */
import { describe, it, expect } from "vitest";
import { buildNavGroups } from "@/components/admin/AdminSidebar";

describe("admin sidebar — buildNavGroups() canonical structure", () => {
  const groups = buildNavGroups();

  it("matches the canonical ordered group ids / labels / sections", () => {
    const shape = groups.map((g) => ({
      id: g.id,
      label: g.label,
      sections: g.sections.map((s) => ({ value: s.value, label: s.label })),
    }));

    expect(shape).toEqual([
      {
        id: "financial-defaults",
        label: "Financial Defaults",
        sections: [
          { value: "defaults-management-company", label: "Management Company" },
          { value: "defaults-property",           label: "Property" },
          { value: "defaults-market-macro",       label: "Market & Macro" },
          { value: "constants",                   label: "Constants" },
        ],
      },
      {
        id: "users",
        label: "Users",
        sections: [
          { value: "users", label: "All Users" },
        ],
      },
      {
        id: "scenarios",
        label: "Scenarios",
        sections: [
          { value: "scenarios",           label: "All Scenarios" },
          { value: "default-assignments", label: "Default Assignments" },
        ],
      },
      {
        id: "brand",
        label: "Brand & Appearance",
        sections: [
          { value: "brand", label: "Brand Settings" },
        ],
      },
      {
        id: "reports",
        label: "Reports & Exports",
        sections: [
          { value: "exports", label: "All Exports" },
        ],
      },
      {
        id: "testing",
        label: "Testing & Verification",
        sections: [
          { value: "verification", label: "Verification" },
          { value: "qa-sandbox",   label: "QA Sandbox" },
        ],
      },
      {
        id: "app-settings",
        label: "App Settings",
        sections: [
          { value: "notifications", label: "Notifications" },
          { value: "navigation",    label: "Navigation" },
          { value: "database",      label: "Database" },
          { value: "activity",      label: "Activity" },
        ],
      },
    ]);
  });

  it("Activity lives inside App Settings (and only there)", () => {
    const owners = groups.filter((g) =>
      g.sections.some((s) => s.value === "activity"),
    );
    expect(owners.map((g) => g.id)).toEqual(["app-settings"]);
  });

  it("no single-item group duplicates its only child's label", () => {
    // Guard against re-introducing a redundant wrapper: if a group has
    // exactly one section AND the group label equals that section's label,
    // the group is just nesting noise. Either flatten the section into a
    // top-level item or give the group a meaningfully different category
    // label.
    const offenders = groups
      .filter((g) => g.sections.length === 1 && g.sections[0].label === g.label)
      .map((g) => `${g.id} (label="${g.label}")`);
    expect(
      offenders,
      `single-item groups with duplicate child label: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("group ids are unique", () => {
    const ids = groups.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("section values are globally unique across groups", () => {
    const values = groups.flatMap((g) => g.sections.map((s) => s.value));
    expect(new Set(values).size).toBe(values.length);
  });
});
