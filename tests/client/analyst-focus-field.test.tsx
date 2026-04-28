// @vitest-environment happy-dom
/**
 * Task #774 — Lock in the "Open this field" same-page focus behavior.
 *
 * Background:
 *   Task #767 fixed a bug where clicking the "Open this field" link on a
 *   Funding-tab Analyst verdict card was a silent no-op when the user was
 *   already sitting on the Funding tab. The fix made
 *   `useFocusFieldFromUrl` re-fire whenever the URL search string changes
 *   (by subscribing to wouter's `useSearch()`), instead of only running
 *   on the host page's initial mount.
 *
 *   That fix is one-line-fragile: someone reverting the deps array back
 *   to `[]`, or replacing wouter's `navigate` with a plain
 *   `history.pushState` that wouter's monkey-patch doesn't see, would
 *   quietly bring the bug back. The unit tests in
 *   `tests/client/analyst-mount-points.test.ts` cover the producer side
 *   (the resolver appends `?focus=<id>`); the e2e test in
 *   `tests/client/analyst-adjust-deep-link-e2e.test.tsx` covers the
 *   initial-mount case (URL already has `?focus=<id>` when the page
 *   mounts). Neither covers the same-page case, which is exactly what
 *   #767 fixed and what this file pins down.
 *
 * Approach:
 *   Mount a tiny harness that hosts a `[data-field="<id>"]` element and
 *   calls `useFocusFieldFromUrl()`. Use the REAL wouter `navigate` so
 *   wouter's pushState monkey-patch dispatches the synthetic events
 *   that `useSearch()` reads via `useSyncExternalStore` — this is the
 *   exact mechanism that has to keep working for the same-page link
 *   to fire the focus side-effect.
 *
 * Tests:
 *   1. Initial-mount focus: URL already carries `?focus=<id>` when the
 *      hook first runs → existing field is focused (existing behavior).
 *   2. Same-page focus: hook mounts WITHOUT `?focus=`, then a wouter
 *      `navigate(...?focus=<id>)` lands while the same component is
 *      still mounted → field is focused without a remount (#767 fix).
 *   3. Param stripping: after the focus side-effect succeeds, the
 *      `?focus` param is removed from the URL so a re-render or
 *      back-nav doesn't re-fire it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, waitFor, act } from "@testing-library/react";
import { navigate as wouterNavigate } from "wouter/use-browser-location";

import { useFocusFieldFromUrl } from "../../client/src/lib/analyst-focus-field";

const FIELD = "capitalRaise1Amount";

// Tracks scrollIntoView call so we can assert which element the focus
// hook landed on. happy-dom doesn't implement scrollIntoView, so we
// stub it with a plain function (not arrow) to capture `this`.
let lastScrolledElement: Element | null = null;

function FocusHarness({ fieldId = FIELD }: { fieldId?: string }) {
  // Use a short retry budget so the "field never appears" branch (not
  // exercised here) doesn't slow the suite. The real defaults are 20 *
  // 100ms = 2s; the field IS in the DOM at mount, so the first attempt
  // succeeds and these values don't actually fire a retry.
  useFocusFieldFromUrl({ maxAttempts: 5, retryMs: 10 });
  // tabindex makes the div itself a valid focus target so the hook's
  // `focusFieldElement` lands focus on it (matches the
  // `[tabindex]` selector in `analyst-focus-field.ts`).
  return <div data-field={fieldId} tabIndex={-1} data-testid="harness-field" />;
}

beforeEach(() => {
  lastScrolledElement = null;
  Element.prototype.scrollIntoView = function (this: Element) {
    lastScrolledElement = this;
  } as Element["scrollIntoView"];
  // Reset the URL between tests so a stale `?focus=` from one test
  // doesn't leak into the next one.
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useFocusFieldFromUrl — 'Open this field' same-page deep link", () => {
  it("focuses the field on initial mount when the URL already carries ?focus=<id>", async () => {
    window.history.replaceState(null, "", `/?focus=${FIELD}`);

    render(<FocusHarness />);

    // The hook defers the first attempt with setTimeout(0); waitFor
    // gives the scheduled task a chance to run.
    await waitFor(() => {
      expect(lastScrolledElement).not.toBeNull();
    });
    expect((lastScrolledElement as HTMLElement).dataset.field).toBe(FIELD);
  });

  it("focuses the field on a same-page wouter navigate that adds ?focus=<id> (#767 fix)", async () => {
    // Start on the destination "page" with NO focus param — this is the
    // exact scenario #767 fixed: the user is already sitting on the
    // Funding tab when they click "Open this field" in the Analyst
    // verdict, so the host component never remounts.
    window.history.replaceState(null, "", "/");

    render(<FocusHarness />);

    // Sanity: with no ?focus= in the URL, the hook is a no-op and
    // nothing is scrolled.
    await new Promise((r) => setTimeout(r, 5));
    expect(lastScrolledElement).toBeNull();

    // Now simulate the verdict card's CTA: a wouter navigate that
    // adds ?focus=<id> while the harness stays mounted. Wrap in act()
    // so the useSyncExternalStore-driven re-render flushes before the
    // assertions run.
    //
    // Crucially, this uses the REAL wouter `navigate` (not a mock).
    // Wouter monkey-patches history.pushState to dispatch a synthetic
    // event that useSearch() subscribes to; if a future change swaps
    // wouter's navigate for a plain `history.pushState` call (which
    // does NOT fire popstate or wouter's synthetic event), the hook
    // would never re-fire and this test would fail.
    act(() => {
      wouterNavigate(`/?focus=${FIELD}`);
    });

    await waitFor(() => {
      expect(lastScrolledElement).not.toBeNull();
    });
    expect((lastScrolledElement as HTMLElement).dataset.field).toBe(FIELD);
  });

  it("strips the ?focus param from the URL after the focus side-effect succeeds", async () => {
    window.history.replaceState(null, "", `/?focus=${FIELD}&keep=1`);

    render(<FocusHarness />);

    await waitFor(() => {
      expect(lastScrolledElement).not.toBeNull();
    });

    // After success, the hook calls history.replaceState to drop the
    // focus param so a re-render or back-nav doesn't re-fire focus.
    // Other query params (and the rest of the URL) must survive.
    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.has("focus")).toBe(false);
      expect(params.get("keep")).toBe("1");
    });
  });
});
