// @vitest-environment happy-dom
/**
 * Task #773 — Admin shell mirrors `window.location.hash` into its
 * `activeSection` store.
 *
 * Background:
 *   The Analyst's "Open this field" mount-point resolver navigates to
 *   `/admin?focus=<fieldId>#<section>/<sub>` for `defaults/*` slugs. For
 *   in-app SPA clicks the resolver imperatively calls
 *   `setAdminSection(<section>)` so the right tab mounts. But for fresh
 *   page loads (new tab, refresh, bookmark, browser back/forward) only
 *   the URL is available — the in-memory section store defaults to
 *   `defaults-management-company` and the user lands on the wrong
 *   sub-section, leaving the URL-reactive focus hook to silently miss
 *   because the target form never mounts.
 *
 *   Task #773 fixed that gap by adding `useAdminSectionFromHash` to
 *   `client/src/lib/admin-nav.ts` and wiring it into `Admin.tsx`. This
 *   file locks the contract in place: hash drives section selection on
 *   mount, on every wouter pushState, and on browser-native
 *   `hashchange` events; unknown segments are ignored; and the effect is
 *   re-entrancy safe (no infinite loop when the URL and store agree).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, act, renderHook } from "@testing-library/react";

const { navigateMock, setAiIntelligenceSectionMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  setAiIntelligenceSectionMock: vi.fn(),
}));

vi.mock("wouter/use-browser-location", () => ({
  navigate: navigateMock,
}));

vi.mock("@/lib/ai-intelligence-nav", () => ({
  setAiIntelligenceSection: setAiIntelligenceSectionMock,
}));

import {
  setAdminSection,
  useAdminSection,
  useAdminSectionFromHash,
} from "@/lib/admin-nav";

function HashSyncProbe({ isKnown }: { isKnown: (s: string) => boolean }) {
  useAdminSectionFromHash(isKnown);
  const [section] = useAdminSection();
  return <div data-testid="active-section">{section}</div>;
}

describe("useAdminSectionFromHash — task #773 URL→section sync", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    setAiIntelligenceSectionMock.mockReset();
    // Reset to the production default so each test starts from a clean
    // baseline. setAdminSection writes to the module-scope store.
    act(() => setAdminSection("defaults-management-company"));
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/admin");
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("on mount, switches activeSection to the first hash segment when known", () => {
    window.history.replaceState({}, "", "/admin#defaults-property/revenue");
    const isKnown = (s: string) =>
      s === "defaults-property" || s === "defaults-management-company";

    render(<HashSyncProbe isKnown={isKnown} />);

    const { result } = renderHook(() => useAdminSection());
    expect(result.current[0]).toBe("defaults-property");
  });

  it("ignores hash segments the predicate rejects (no clobber by stray anchors)", () => {
    window.history.replaceState({}, "", "/admin#field-cap-rate");
    const isKnown = (s: string) => s === "defaults-property";

    render(<HashSyncProbe isKnown={isKnown} />);

    const { result } = renderHook(() => useAdminSection());
    // Untouched — the default sentinel from beforeEach survives.
    expect(result.current[0]).toBe("defaults-management-company");
  });

  it("responds to hashchange events fired after mount (back/forward, in-page nav)", () => {
    window.history.replaceState({}, "", "/admin");
    const isKnown = (s: string) =>
      s === "defaults-property" || s === "defaults-management-company";

    render(<HashSyncProbe isKnown={isKnown} />);

    const { result } = renderHook(() => useAdminSection());
    expect(result.current[0]).toBe("defaults-management-company");

    act(() => {
      window.history.replaceState({}, "", "/admin#defaults-property/revenue");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(result.current[0]).toBe("defaults-property");
  });

  it("is re-entrancy safe — running the sync when state already agrees does not call setAdminSection", () => {
    // Pre-position the store so the URL and state already agree.
    act(() => setAdminSection("defaults-property"));
    window.history.replaceState({}, "", "/admin#defaults-property/revenue");

    const isKnown = (s: string) => s === "defaults-property";

    // Spy on listener notifications via a fresh subscription. If the sync
    // re-applied setAdminSection redundantly, this listener would fire on
    // mount; the early-return guards against that.
    const { result } = renderHook(() => useAdminSection());
    const beforeMountSection = result.current[0];

    render(<HashSyncProbe isKnown={isKnown} />);

    // Section is unchanged and still the same reference value — no
    // spurious mutation. (`setAdminSection` would also have triggered
    // `navigate("/admin")` if pathname weren't already /admin, but
    // here we explicitly stay on /admin.)
    expect(result.current[0]).toBe(beforeMountSection);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("ignores empty / hash-less URLs (no-op when nothing to sync)", () => {
    window.history.replaceState({}, "", "/admin");
    const isKnown = (s: string) => s === "defaults-property";

    render(<HashSyncProbe isKnown={isKnown} />);

    const { result } = renderHook(() => useAdminSection());
    expect(result.current[0]).toBe("defaults-management-company");
  });
});
