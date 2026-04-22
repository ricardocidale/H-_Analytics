/**
 * Phase 4 (Constants doctrine) — static-analysis lock on the read-only
 * Constants admin tab.
 *
 * The Constants admin surface is the user-facing companion to the Phase 3
 * server guard: admins must NOT be able to type a value, NOT be able to
 * approve a value before write, and the only available actions on a
 * row must be Refresh research, History, and Reset to factory.
 *
 * This test is a static-analysis safety net — a true RTL/Vitest DOM test
 * would require installing @testing-library/react and switching the test
 * environment to happy-dom for this file (the project keeps node-only
 * vitest defaults). Pattern matches the Phase 3 guard test.
 *
 * Acceptance:
 *   (a) The read-only card markup renders no `<Input>` and no number
 *       input control. The value is displayed in a `<div>`/`<span>`,
 *       never an `<input type="number">`.
 *   (b) The Refresh research button calls POST /refresh and shows a
 *       results panel — no /regenerate, no /apply-research, no diff
 *       approval step.
 *   (c) Reset to factory is preserved (rollback escape hatch).
 *   (d) The Override path is removed entirely. The component does not
 *       define an `OverrideDialog` and does not import number inputs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../../client/src/components/admin/model-defaults/ModelConstantsTab.tsx"),
  "utf8",
);

describe("ModelConstantsTab (Phase 4 read-only doctrine)", () => {
  it("does NOT render any number/text input for Constants values", () => {
    // No <Input ...> JSX of any flavour — Phase 3 deletes the manual
    // value-entry surface entirely.
    expect(SRC).not.toMatch(/<Input\b/);
    expect(SRC).not.toMatch(/<Textarea\b/);
    expect(SRC).not.toMatch(/type="number"/);
  });

  it("does NOT define or render an OverrideDialog", () => {
    expect(SRC).not.toMatch(/function\s+OverrideDialog\b/);
    expect(SRC).not.toMatch(/<OverrideDialog\b/);
    // Also: no PUT call to the manual override route from the UI.
    expect(SRC).not.toMatch(/method:\s*"PUT"/);
  });

  it("uses the new Refresh research one-shot endpoint, not the two-step Regenerate→Apply", () => {
    expect(SRC).toMatch(/\/refresh/);
    expect(SRC).toMatch(/Refresh research/);
    // The two-step admin path is gone from the UI.
    expect(SRC).not.toMatch(/\/regenerate(?!d)/);
    expect(SRC).not.toMatch(/\/apply-research/);
    // No Regenerate button text in the rendered JSX. (The doctrine
    // comment at the top of the file documents the *removed* surface;
    // strip JS/JSX comments before asserting on the rendered tree.)
    const code = SRC
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/>\s*Regenerate/);
    expect(code).not.toMatch(/RegenerateDialog/);
  });

  it("preserves the Reset to factory escape hatch", () => {
    expect(SRC).toMatch(/Reset to factory/);
    expect(SRC).toMatch(/method:\s*"DELETE"/);
    expect(SRC).toMatch(/button-reset-/);
  });

  it("renders the Specialist letter badge for ownership clarity", () => {
    expect(SRC).toMatch(/SpecialistBadge/);
    expect(SRC).toMatch(/specialistLetter/);
    expect(SRC).toMatch(/badge-specialist-/);
  });

  it("exposes the per-row research-history affordance", () => {
    expect(SRC).toMatch(/HistoryButton/);
    expect(SRC).toMatch(/research-history/);
    expect(SRC).toMatch(/button-history-/);
  });

  it("declares the doctrine in the header comment", () => {
    expect(SRC).toMatch(/read-only/i);
    expect(SRC).toMatch(/Refresh research/);
  });
});
