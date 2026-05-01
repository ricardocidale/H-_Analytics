// @vitest-environment happy-dom
/**
 * Task #778 — Lock-in test for the same-page Adjust → focus contract.
 *
 * Companion to:
 *   - `tests/client/analyst-adjust-deep-link-e2e.test.tsx` (Task #761),
 *     which covers the cross-page case (resolver appends `?focus=<id>`,
 *     destination page mounts, focus lands).
 *   - `tests/e2e/analyst-adjust-deep-link.spec.ts` (Task #763), which
 *     drives the cross-page case in a real browser.
 *
 * What this file proves
 * ---------------------
 * The original implementation of `useFocusFieldFromUrl()` ran with `[]`
 * deps — once on mount and never again. When the Analyst's "Adjust" CTA
 * pointed at a field whose mount point was the *same* page the user was
 * already on (e.g. funding verdict → `company-assumptions/funding`
 * field), wouter's `navigate()` only pushed history state — the page
 * never re-mounted, the effect never re-fired, and no focus landed.
 *
 * Task #767 fixed the hook by subscribing to wouter's `useSearch()` so
 * the effect re-runs whenever the URL search string changes. This file
 * locks in that contract end-to-end via jsdom: render a host that calls
 * `useFocusFieldFromUrl()`, drive a same-page `history.pushState` that
 * adds `?focus=<id>`, and assert the field's input receives focus and
 * the param is stripped from the URL afterwards.
 *
 * Why this is a separate file from the cross-page e2e:
 *   The cross-page tests mock `wouter/use-browser-location.navigate` to
 *   capture the URL the resolver asked for. Here we deliberately do NOT
 *   mock it — the contract under test is precisely that wouter's
 *   real `pushState` monkey-patch dispatches the synthetic event that
 *   `useSearch()` reads, and the focus hook re-fires off of it. Mocking
 *   `navigate` would short-circuit the very seam we're verifying.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { act, render, screen, cleanup, waitFor } from "@testing-library/react";

import {
  useFocusFieldFromUrl,
  FOCUS_QUERY_PARAM,
} from "../../client/src/lib/analyst-focus-field";

const FIELD_ID = "capitalRaise1Amount";
const HOST_PATH = "/company/assumptions";

/**
 * Minimal host component that mirrors the production wiring:
 * `CompanyAssumptions.tsx` calls `useFocusFieldFromUrl()` once and
 * renders form-field section components whose markers use the
 * `data-field` convention (see `FundingSection.tsx` lines 91–100 for
 * the precedent — `<span data-field="capitalRaise1Amount">` wraps the
 * editable control). Keeping this stub minimal isolates the focus
 * hook's URL-reactive behavior from the assumptions page's broader
 * data-fetching surface.
 */
function FocusHost(): JSX.Element {
  useFocusFieldFromUrl({ retryMs: 5 });
  return (
    <div>
      <span data-field={FIELD_ID}>
        <input
          type="text"
          data-testid={`input-${FIELD_ID}`}
          aria-label="Capital raise 1 amount"
        />
      </span>
    </div>
  );
}

let lastScrolledElement: Element | null = null;

beforeEach(() => {
  lastScrolledElement = null;
  // happy-dom does not implement scrollIntoView; the focus hook calls
  // it before focusing. Use a plain function so `this` binds to the
  // element being scrolled, mirroring the shim in the cross-page e2e
  // (`tests/client/analyst-adjust-deep-link-e2e.test.tsx`).
  Element.prototype.scrollIntoView = function (this: Element) {
    lastScrolledElement = this;
  } as Element["scrollIntoView"];
  // Always start each test on a clean URL so a leaked `?focus=` from a
  // prior test cannot accidentally satisfy the assertion below.
  window.history.replaceState(null, "", HOST_PATH);
});

afterEach(() => {
  cleanup();
  // Restore the URL between tests so the next file starts clean.
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("useFocusFieldFromUrl — same-page navigation (task #778)", () => {
  it("focuses the field when a same-page pushState adds ?focus=<id> after mount", async () => {
    render(<FocusHost />);

    const input = screen.getByTestId(`input-${FIELD_ID}`);
    // Sanity: nothing has been focused yet — the host mounted with no
    // `?focus=` in the URL, so the hook's first effect ran and exited
    // early without touching the DOM.
    expect(document.activeElement).not.toBe(input);
    expect(lastScrolledElement).toBeNull();

    // Drive a same-page navigation the way wouter's `navigate()` does
    // (history.pushState, which the wouter monkey-patch in
    // `node_modules/wouter/src/use-browser-location.js` augments to
    // dispatch a `pushState` event). `useSearch()` listens for that
    // event via `useSyncExternalStore`, so the focus hook's effect
    // should re-fire. Wrapped in `act` so React flushes the resulting
    // state update synchronously before we wait for the focus.
    const targetUrl = `${HOST_PATH}?${FOCUS_QUERY_PARAM}=${FIELD_ID}`;
    await act(async () => {
      window.history.pushState(null, "", targetUrl);
    });

    // The hook defers focus on a `setTimeout(0)` so Suspense / lazy
    // boundaries get a chance to render — wait for it to land.
    await waitFor(
      () => {
        expect(lastScrolledElement).toBe(
          document.querySelector(`[data-field="${FIELD_ID}"]`),
        );
        expect(document.activeElement).toBe(input);
      },
      { timeout: 1000 },
    );

    // After a successful focus the hook strips `?focus` so a re-render
    // or a back-nav doesn't re-fire the side-effect. The path the
    // browser ends up on must match where the user is sitting (no
    // accidental redirect / hash loss).
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    expect(window.location.pathname).toBe(HOST_PATH);
  });

  it("re-focuses the field on a second same-page pushState after the first focus stripped the param", async () => {
    render(<FocusHost />);

    const input = screen.getByTestId(`input-${FIELD_ID}`);

    // First Adjust click — same-page nav, focus lands, param stripped.
    await act(async () => {
      window.history.pushState(
        null,
        "",
        `${HOST_PATH}?${FOCUS_QUERY_PARAM}=${FIELD_ID}`,
      );
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    // Move focus away so the second-click assertion is meaningful (a
    // no-op effect would leave the input still focused from round 1).
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(document.activeElement).not.toBe(input);
    lastScrolledElement = null;

    // Second Adjust click on the same field — the URL transitions
    // from "" back to `?focus=<id>`. Without the URL-reactive deps
    // this would silently no-op (the hook would still see its own
    // initial-mount snapshot). The contract is: every fresh
    // `?focus=<id>` push gets a fresh focus.
    await act(async () => {
      window.history.pushState(
        null,
        "",
        `${HOST_PATH}?${FOCUS_QUERY_PARAM}=${FIELD_ID}`,
      );
    });

    await waitFor(
      () => {
        expect(lastScrolledElement).toBe(
          document.querySelector(`[data-field="${FIELD_ID}"]`),
        );
        expect(document.activeElement).toBe(input);
      },
      { timeout: 1000 },
    );
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
  });

  it("preserves coexisting query params (e.g. ?tab=funding) when stripping ?focus", async () => {
    // The Company Assumptions page mirrors the active tab to `?tab=`
    // (see `getInitialTab` in `client/src/pages/CompanyAssumptions.tsx`).
    // A same-page Adjust click pushes `?tab=funding&focus=<id>`; after
    // focus succeeds the hook must strip ONLY `focus`, leaving the
    // tab param intact so the user does not get bumped off the
    // funding tab they're currently editing.
    render(<FocusHost />);

    const input = screen.getByTestId(`input-${FIELD_ID}`);

    await act(async () => {
      window.history.pushState(
        null,
        "",
        `${HOST_PATH}?tab=funding&${FOCUS_QUERY_PARAM}=${FIELD_ID}`,
      );
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
    await waitFor(() => {
      expect(window.location.search).toBe("?tab=funding");
    });
  });
});
