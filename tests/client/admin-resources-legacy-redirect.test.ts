// @vitest-environment happy-dom
/**
 * Task #421 / Task #459 — old admin Resources shortcuts must land on the
 * new /ai-intelligence Resources home.
 *
 * Task #418 made any leftover `resources-*` admin deep link fall back to
 * the Admin "Services & Fees" landing page so users wouldn't hit a blank
 * screen. The Resources surface (APIs / Sources / Tables / Benchmarks /
 * Models) lives under `/ai-intelligence` now, so a generic Admin landing
 * isn't helpful — Task #449 Phase 1 wired `setAdminSection` to intercept
 * these legacy keys and route the user to `/ai-intelligence` with the
 * matching tab pre-selected.
 *
 * Task #459 explicitly asked for a focused behavioral test that exercises
 * the runtime intercept in `setAdminSection` (the sibling
 * `tests/client/admin-redirects-snapshot.test.ts` only covers the static
 * redirect map). The `it.each(RESOURCES_LEGACY_SECTIONS)` block below
 * fulfils that requirement: every legacy `resources-*` key drives the
 * intercept end-to-end and asserts both the AI Intelligence section
 * selection and the wouter navigation side-effect, so a future refactor
 * that reorders the navigation logic in `client/src/lib/admin-nav.ts`
 * will fail loudly here.
 *
 * This test locks the runtime contract in place:
 *   1. Each `resources-*` legacy key triggers `setAiIntelligenceSection`
 *      with the same key (so the matching tab is selected).
 *   2. Each `resources-*` legacy key navigates to `/ai-intelligence`
 *      when the user is on a different page.
 *   3. The admin section state is NOT mutated for these keys (the
 *      Admin "Services & Fees" fallback is no longer used for them).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  navigateMock,
  setAiIntelligenceSectionMock,
  setResourcesCatalogKindHintMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  setAiIntelligenceSectionMock: vi.fn(),
  setResourcesCatalogKindHintMock: vi.fn(),
}));

vi.mock("wouter/use-browser-location", () => ({
  navigate: navigateMock,
}));

vi.mock("@/lib/ai-intelligence-nav", () => ({
  setAiIntelligenceSection: setAiIntelligenceSectionMock,
  setResourcesCatalogKindHint: setResourcesCatalogKindHintMock,
}));

import { renderHook, act } from "@testing-library/react";
import { setAdminSection, useAdminSection } from "@/lib/admin-nav";
import { RESOURCES_LEGACY_SECTIONS } from "@/components/admin/AdminSidebar";

const LEGACY_TO_KIND: Record<string, string | null> = {
  "resources-apis": "api",
  "resources-sources": "source",
  "resources-benchmarks": "benchmark",
  "resources-models": "model",
  "resources-tables": null,
};

describe("setAdminSection — resources-* legacy keys route to /ai-intelligence", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    setAiIntelligenceSectionMock.mockReset();
    setResourcesCatalogKindHintMock.mockReset();
    // Pretend the user is currently somewhere outside /ai-intelligence so
    // the navigate branch is exercised. jsdom defaults to "/" which is
    // already not under /ai-intelligence, but assert it explicitly.
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/admin");
    }
  });

  // Packet #7 (admin-cleanup-INDEX): the 4 catalog leaves
  // (apis/sources/benchmarks/models) collapsed into a single "resources"
  // entry with internal tabs. The legacy keys must still forward (so old
  // deep links keep working), but they all land on "resources" now.
  // "resources-tables" (Market Data) stays a separate leaf.
  const expectedTarget = (key: string) =>
    key === "resources-tables" ? "resources-tables" : "resources";

  it.each(RESOURCES_LEGACY_SECTIONS)(
    "%s → setAiIntelligenceSection(target) + navigate('/ai-intelligence') + admin section store untouched",
    (key) => {
      // Pin the admin section store to a known sentinel value so we can
      // observe whether the resources-* call mutates it (it must not).
      const sentinel = "users" as const;
      act(() => setAdminSection(sentinel));
      const { result } = renderHook(() => useAdminSection());
      expect(result.current[0]).toBe(sentinel);

      act(() => setAdminSection(key));

      expect(setAiIntelligenceSectionMock).toHaveBeenCalledTimes(1);
      expect(setAiIntelligenceSectionMock).toHaveBeenCalledWith(expectedTarget(key));

      // Sub-tab fidelity: legacy catalog keys (apis/sources/benchmarks/
      // models) must seed the kind hint so ResourcesAdminPage opens on
      // the matching inner tab; resources-tables (Market Data) is its
      // own AI section and must NOT touch the catalog kind hint.
      const expectedKind = LEGACY_TO_KIND[key];
      if (expectedKind) {
        expect(setResourcesCatalogKindHintMock).toHaveBeenCalledTimes(1);
        expect(setResourcesCatalogKindHintMock).toHaveBeenCalledWith(expectedKind);
      } else {
        expect(setResourcesCatalogKindHintMock).not.toHaveBeenCalled();
      }

      expect(navigateMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith("/ai-intelligence");

      // The admin section store must NOT change for resources-* keys —
      // those keys are not valid AdminSection values, and the old
      // "Services & Fees" fallback is no longer used for them.
      expect(result.current[0]).toBe(sentinel);
    },
  );

  it("does NOT navigate when the user is already under /ai-intelligence", () => {
    window.history.replaceState({}, "", "/ai-intelligence");

    setAdminSection("resources-tables");

    expect(setAiIntelligenceSectionMock).toHaveBeenCalledWith("resources-tables");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("non-resources sections still flow through the admin section store (no AI nav side effect)", () => {
    setAdminSection("users");

    expect(setAiIntelligenceSectionMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
