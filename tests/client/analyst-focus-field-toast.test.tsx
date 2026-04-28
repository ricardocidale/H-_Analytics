// @vitest-environment happy-dom
/**
 * Task #780 — User-facing toast when `useFocusFieldFromUrl()` exhausts
 * its retry budget.
 *
 * Background:
 *   Task #776 added a dev-only `console.warn` when the focus hook gives
 *   up. That covers the developer experience but a non-developer admin
 *   clicking Adjust on an Analyst verdict still sees nothing happen if
 *   the destination field is hidden inside a collapsed/conditional
 *   section. This task closes that UX gap with a single, dismissable
 *   toast that runs in both dev and production.
 *
 * Tests:
 *   1. Toast fires once with title + description when the retry budget
 *      is exhausted (no marker ever appears in the DOM).
 *   2. Toast does NOT fire on the happy path (marker is in the DOM and
 *      the very first focus attempt succeeds).
 *   3. Toast fires only once per Adjust navigation: re-rendering the
 *      hook host after exhaustion does not re-fire the toast, because
 *      the `?focus` param is already stripped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup, waitFor } from "@testing-library/react";

// Subscribe-to-search stub so the hook re-runs on URL changes without a
// real router. Mirrors the wouter mock used in the sibling warning test.
vi.mock("wouter", () => ({
  useSearch: () => window.location.search.replace(/^\?/, ""),
}));

// Mock the toast helper so we can assert exact call shape without
// rendering the real <Toaster> tree. The real `toast` is a singleton
// dispatcher exported from `@/hooks/use-toast`; replacing it with a spy
// is the same pattern other call-sites would use to test toast wiring.
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  toast: (args: unknown) => toastSpy(args),
}));

import { useFocusFieldFromUrl } from "@/lib/analyst-focus-field";

function HookHost(props: { maxAttempts?: number; retryMs?: number }): null {
  useFocusFieldFromUrl({
    maxAttempts: props.maxAttempts,
    retryMs: props.retryMs,
  });
  return null;
}

describe("useFocusFieldFromUrl — exhaust-budget toast", () => {
  beforeEach(() => {
    toastSpy.mockClear();
    // Silence the dev-mode console.warn that fires in lockstep with the
    // toast — it isn't what this file is testing and we don't want a
    // noisy spec output.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("fires a single toast with title + description when the field is missing", async () => {
    const FIELD = "missingField";
    window.history.replaceState(null, "", `/some/page?focus=${FIELD}`);

    render(React.createElement(HookHost, { maxAttempts: 3, retryMs: 5 }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledTimes(1);
    });

    const arg = toastSpy.mock.calls[0][0] as {
      title?: unknown;
      description?: unknown;
    };
    // Assert the *shape* the rest of the app uses (title + description),
    // not the exact copy — that way a copy tweak doesn't break the test
    // but a regression that drops one of the fields does.
    expect(arg.title).toBeTruthy();
    expect(arg.description).toBeTruthy();
    expect(String(arg.description)).toMatch(/collapsed/i);

    // Sanity: the hook still strips the focus param on exhaustion so a
    // re-render can't re-trigger the side-effect.
    expect(window.location.search).toBe("");
  });

  it("does not fire the toast on the happy path when the field marker is present", async () => {
    const FIELD = "presentField";
    const marker = document.createElement("div");
    marker.setAttribute("data-field", FIELD);
    marker.appendChild(document.createElement("input"));
    document.body.appendChild(marker);

    window.history.replaceState(null, "", `/some/page?focus=${FIELD}`);

    render(React.createElement(HookHost, { maxAttempts: 3, retryMs: 5 }));

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    expect(toastSpy).not.toHaveBeenCalled();

    document.body.removeChild(marker);
  });

  it("fires only once per Adjust navigation — re-render after exhaustion does not re-toast", async () => {
    const FIELD = "alsoMissing";
    window.history.replaceState(null, "", `/some/page?focus=${FIELD}`);

    const { rerender } = render(
      React.createElement(HookHost, { maxAttempts: 3, retryMs: 5 }),
    );

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledTimes(1);
    });
    // After exhaustion the param is gone — proves the next render won't
    // even enter the retry loop.
    expect(window.location.search).toBe("");

    // Force a re-render of the hook host. The `?focus` param is already
    // stripped, so `useFocusFieldFromUrl` should short-circuit and the
    // toast count must stay at exactly 1.
    rerender(React.createElement(HookHost, { maxAttempts: 3, retryMs: 5 }));

    // Give any deferred timers a tick to flush before the negative
    // assertion.
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(toastSpy).toHaveBeenCalledTimes(1);
  });
});
