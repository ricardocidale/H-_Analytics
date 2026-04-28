// @vitest-environment happy-dom
/**
 * Task #776 — Dev-mode warning when `useFocusFieldFromUrl()` exhausts
 * its retry budget.
 *
 * Background:
 *   The build-time audit (task #771) catches static drift between the
 *   field registry and the destination form's source code, but only
 *   static drift. A field marker can still be present in source yet
 *   hidden at runtime — for example, when it sits inside a
 *   collapsed/conditional section like the toggle-gated rows in
 *   `ConvertibleTermsCard` (`{showValuationCap && ...}` in
 *   `FundingSection.tsx`). In that case the user clicks Adjust, lands
 *   on the right page, and the focus hook silently exhausts its retry
 *   budget. Adding a dev-mode `console.warn` surfaces this class of
 *   failure during normal development without polluting production
 *   logs.
 *
 * Tests:
 *   1. Warning fires when no marker is in the DOM and the retry budget
 *      is exhausted, naming the missing fieldId and the URL.
 *   2. Warning does NOT fire on the happy path (marker is in the DOM
 *      and the hook focuses it on the first attempt).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup, waitFor } from "@testing-library/react";

// `useFocusFieldFromUrl()` subscribes to wouter's `useSearch()` so it
// re-fires whenever the URL search string changes. Stub it so the hook
// can be exercised without a router; it returns `window.location.search`
// exactly as the real hook would on first render.
vi.mock("wouter", () => ({
  useSearch: () => window.location.search.replace(/^\?/, ""),
}));

import { useFocusFieldFromUrl } from "@/lib/analyst-focus-field";

function HookHost(props: { maxAttempts?: number; retryMs?: number }): null {
  useFocusFieldFromUrl({
    maxAttempts: props.maxAttempts,
    retryMs: props.retryMs,
  });
  return null;
}

describe("useFocusFieldFromUrl — dev-mode retry-exhausted warning", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Force dev-mode for the duration of each test so the production
    // gate doesn't hide the warning. `vi.stubEnv` round-trips through
    // Vite's `import.meta.env` shim so the assertion below sees DEV=true
    // regardless of how the test runner was launched.
    vi.stubEnv("DEV", "true");
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Reset the URL between tests so a leftover ?focus from one case
    // doesn't bleed into another.
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("warns once with the missing fieldId and current URL when no marker is in the DOM", async () => {
    const FIELD = "fieldThatDoesNotExist";
    window.history.replaceState(null, "", `/some/page?focus=${FIELD}`);

    // Tight budget so the test doesn't have to wait long. 3 attempts at
    // 5ms each + the deferred initial 0ms tick is well under 100ms.
    render(React.createElement(HookHost, { maxAttempts: 3, retryMs: 5 }));

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain("[analyst-focus-field]");
    expect(message).toContain(FIELD);
    // The warning must include the URL so a developer can immediately
    // see which destination page asked for the missing field.
    expect(message).toContain(`focus=${FIELD}`);

    // The hook must still strip the `?focus` param after exhaustion so
    // a re-render doesn't re-fire the side-effect (and re-warn).
    expect(window.location.search).toBe("");
  });

  it("does not warn on the happy path when the field marker is present", async () => {
    const FIELD = "fieldThatExists";
    // Pre-mount the marker so the very first attempt succeeds.
    const marker = document.createElement("div");
    marker.setAttribute("data-field", FIELD);
    const input = document.createElement("input");
    marker.appendChild(input);
    document.body.appendChild(marker);

    window.history.replaceState(null, "", `/some/page?focus=${FIELD}`);

    render(React.createElement(HookHost, { maxAttempts: 3, retryMs: 5 }));

    // Wait for the post-effect URL cleanup so we know the hook ran to
    // completion. Asserting the negative ("warn was not called") only
    // makes sense after the hook has had a chance to finish.
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    expect(warnSpy).not.toHaveBeenCalled();

    document.body.removeChild(marker);
  });

  it("does not warn in production builds even when the field is missing", async () => {
    // Flip the env gate to production for this single case to prove the
    // warning is dev-only — regression guard against the production
    // log pollution the task explicitly forbids.
    vi.stubEnv("DEV", "");
    const FIELD = "fieldMissingInProd";
    window.history.replaceState(null, "", `/some/page?focus=${FIELD}`);

    render(React.createElement(HookHost, { maxAttempts: 3, retryMs: 5 }));

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
