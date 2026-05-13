/**
 * Task #1626 — Narrow-layout squeeze regression guard
 *
 * The shrink-0 / min-w-0 fixes applied in the 2026-05-13 sweep prevent the
 * EditableValue chip (percent/dollar/number) from being crushed to zero width
 * when the admin model-defaults tabs render at the md breakpoint (768 px).
 *
 * Without an automated check a future contributor could remove those classes
 * and silently reintroduce the bug. These source-level audits lock the
 * protective CSS contract in place without requiring a browser or DOM:
 *
 *   1. FieldHelpers.tsx (shared field components PctField / DollarField /
 *      NumberField) must wrap every EditableValue in `className="shrink-0"`
 *      so the chip cannot shrink.
 *
 *   2. FieldHelpers.tsx must give every label container `min-w-0` so the
 *      label side absorbs excess flex pressure instead of the chip.
 *
 *   3. PropertyUnderwritingTab.tsx must preserve `shrink-0` on the custom
 *      inline EditableValue wrappers (Revenue Analyst CTA row and the
 *      Macro Inflation Rate read-only row) that the sweep also fixed.
 *
 * Methodology: source-grep (readFileSync), same pattern as the
 * capital-stack-discipline-placement.test.ts gate.
 *
 * Why source-grep and not a render test?
 *   The field components render through several context providers
 *   (Tooltip, react-query, auth) and the vitest environment is `node`
 *   (no layout engine). Source-grep is cheaper, faster, and captures the
 *   exact contract — "this protective class must live in this file".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIELD_HELPERS = resolve(
  __dirname,
  "../components/admin/model-defaults/FieldHelpers.tsx",
);
const PROPERTY_UNDERWRITING_TAB = resolve(
  __dirname,
  "../components/admin/model-defaults/PropertyUnderwritingTab.tsx",
);
const MARKET_MACRO_TAB = resolve(
  __dirname,
  "../components/admin/model-defaults/MarketMacroTab.tsx",
);
const EDITABLE_VALUE = resolve(
  __dirname,
  "../components/company-assumptions/EditableValue.tsx",
);

// ── Helper: count occurrences of a string ────────────────────────────────────

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

// ── 1. FieldHelpers.tsx — shared field component layout guards ───────────────

describe("FieldHelpers.tsx — EditableValue chip must not be squeezed", () => {
  const src = readFileSync(FIELD_HELPERS, "utf8");

  it('has at least three `className="shrink-0"` wrappers (one per field type: PctField, DollarField, NumberField)', () => {
    // Each of the three exported field components wraps its <EditableValue>
    // in a <div className="shrink-0">. A count below 3 means at least one
    // field type is missing the protective wrapper.
    const count = countOccurrences(src, 'className="shrink-0"');
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it('has at least three label containers with `min-w-0` (one per field type)', () => {
    // The label side of each flex row must carry min-w-0 so it can shrink
    // under flex pressure rather than pushing the chip off-screen.
    const count = countOccurrences(src, "min-w-0");
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("exports PctField, DollarField, and NumberField", () => {
    // Sanity: the three field factories must still exist; if someone renames
    // them the tests in this suite would pass vacuously.
    expect(src).toMatch(/export function PctField\b/);
    expect(src).toMatch(/export function DollarField\b/);
    expect(src).toMatch(/export function NumberField\b/);
  });

  it("PctField wraps EditableValue inside a shrink-0 div", () => {
    // Extract the PctField function body and check the wrapper is present.
    // We locate the function start and verify shrink-0 appears before the
    // next top-level `export function` declaration.
    const pctStart = src.indexOf("export function PctField");
    const dollarStart = src.indexOf("export function DollarField");
    expect(pctStart).toBeGreaterThanOrEqual(0);
    expect(dollarStart).toBeGreaterThan(pctStart);
    const pctBody = src.slice(pctStart, dollarStart);
    expect(pctBody).toContain('"shrink-0"');
    expect(pctBody).toContain("min-w-0");
    expect(pctBody).toContain("<EditableValue");
  });

  it("DollarField wraps EditableValue inside a shrink-0 div", () => {
    const dollarStart = src.indexOf("export function DollarField");
    const numberStart = src.indexOf("export function NumberField");
    expect(dollarStart).toBeGreaterThanOrEqual(0);
    expect(numberStart).toBeGreaterThan(dollarStart);
    const dollarBody = src.slice(dollarStart, numberStart);
    expect(dollarBody).toContain('"shrink-0"');
    expect(dollarBody).toContain("min-w-0");
    expect(dollarBody).toContain("<EditableValue");
  });

  it("NumberField wraps EditableValue inside a shrink-0 div", () => {
    const numberStart = src.indexOf("export function NumberField");
    const tabBannerStart = src.indexOf("export function TabBanner");
    expect(numberStart).toBeGreaterThanOrEqual(0);
    const numberEnd =
      tabBannerStart !== -1 ? tabBannerStart : src.length;
    const numberBody = src.slice(numberStart, numberEnd);
    expect(numberBody).toContain('"shrink-0"');
    expect(numberBody).toContain("min-w-0");
    expect(numberBody).toContain("<EditableValue");
  });
});

// ── 2. EditableValue.tsx — chip has a fixed display width in edit mode ───────

describe("EditableValue.tsx — input mode has a fixed width so it cannot collapse", () => {
  const src = readFileSync(EDITABLE_VALUE, "utf8");

  it("edit-mode <input> carries a Tailwind width class (w-*) so it cannot shrink to zero", () => {
    // The input rendered while editing must have an explicit Tailwind width
    // (e.g. w-24) so it does not participate in flex shrink.
    expect(src).toMatch(/className="[^"]*\bw-\d+\b[^"]*"/);
  });

  it("display-mode <span> carries font-mono so percent/dollar text is fixed-width", () => {
    // font-mono gives every character the same advance width, preventing the
    // chip from jittering as values change and ensuring consistent widths.
    expect(src).toContain("font-mono");
  });
});

// ── 3. PropertyUnderwritingTab.tsx — custom inline rows also fixed ───────────

describe("PropertyUnderwritingTab.tsx — custom inline EditableValue rows preserved", () => {
  const src = readFileSync(PROPERTY_UNDERWRITING_TAB, "utf8");

  it("uses PctField / DollarField / NumberField from FieldHelpers for standard fields", () => {
    // The tab must import and use the shared helpers (which carry shrink-0)
    // rather than hand-rolling bare <EditableValue> blocks for every field.
    expect(src).toMatch(/import\s*\{[^}]*\bPctField\b[^}]*\}\s*from\s*["']\.\/FieldHelpers["']/);
    expect(src).toMatch(/<PctField\b/);
  });

  it("has at least one `shrink-0` in custom inline rows (e.g. Revenue Analyst CTA, Macro Inflation read-only)", () => {
    // PropertyUnderwritingTab has a few hand-crafted flex rows that wrap bare
    // <EditableValue> or <Button> elements and need their own shrink-0 guards.
    const count = countOccurrences(src, "shrink-0");
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ── 4. MarketMacroTab.tsx — uses protected shared field helpers ──────────────

describe("MarketMacroTab.tsx — standard fields delegated to FieldHelpers", () => {
  const src = readFileSync(MARKET_MACRO_TAB, "utf8");

  it("imports PctField from FieldHelpers", () => {
    expect(src).toMatch(/import\s*\{[^}]*\bPctField\b[^}]*\}\s*from\s*["']\.\/FieldHelpers["']/);
  });

  it("renders PctField components (layout protection inherited)", () => {
    expect(src).toMatch(/<PctField\b/);
  });

  it("Fiscal Year Start Month flex row has gap-2 so columns do not abut", () => {
    // The month selector row was also tightened in the sweep — gap-2 keeps
    // the select and its sibling elements from colliding at narrow widths.
    expect(src).toContain("gap-2");
  });
});
