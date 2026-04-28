// @vitest-environment happy-dom
/**
 * Task #787 — Auto-expand the field's collapsed parent before giving up.
 *
 * Background:
 *   Task #784 made the exhaust-budget toast name the section/tab the user
 *   needs to expand. That closed the *information* gap but the user still
 *   had to scroll there and click the disclosure toggle themselves. This
 *   task closes the *interaction* gap: when the focus hook can't find the
 *   field's marker in the DOM, it scans for an element whose
 *   `data-expand-trigger` lists the field id, clicks it once, and lets
 *   the next retry tick pick up the now-rendered marker. The toast still
 *   fires when expansion fails (no trigger registered, or expanding it
 *   didn't reveal the field).
 *
 * Tests:
 *   1. Auto-expand happy path — a registered trigger reveals the marker
 *      and focus lands without the toast firing.
 *   2. No trigger registered — the existing exhaust-budget toast still
 *      fires (parity with task #780/#784 behavior).
 *   3. Trigger already in an expanded state is NOT clicked — that would
 *      *close* the section the user already opened. The hook detects
 *      this via `aria-expanded`, `data-state="open"`, or
 *      `data-state="checked"`.
 *   4. Multi-field triggers — a single `data-expand-trigger` listing
 *      multiple field ids reveals whichever one is asked for (matches
 *      the space-separated `[~="<id>"]` selector contract).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useState } from "react";
import { render, cleanup, waitFor } from "@testing-library/react";

// `useFocusFieldFromUrl` subscribes to wouter's `useSearch()` so it
// re-fires whenever the URL search string changes. Stub it so the hook
// can be exercised without a router.
vi.mock("wouter", () => ({
  useSearch: () => window.location.search.replace(/^\?/, ""),
}));

// Spy on the toast helper so we can assert when (and when not) the
// exhaust-budget notification fires.
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

/**
 * Mini collapsible harness that mirrors the real-world shape of
 * `ConvertibleTermsCard`: a visible toggle that, when clicked, renders
 * the otherwise-hidden field marker. The toggle advertises its contract
 * via `data-expand-trigger`, so the focus hook should click it on a
 * missed lookup and the marker should appear before the retry budget is
 * exhausted.
 */
function CollapsibleHarness({
  fieldId,
  initiallyOpen = false,
}: {
  fieldId: string;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div>
      <button
        type="button"
        data-expand-trigger={fieldId}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="harness-toggle"
      >
        toggle
      </button>
      {open && (
        <div data-field={fieldId} tabIndex={-1} data-testid="harness-marker" />
      )}
    </div>
  );
}

beforeEach(() => {
  toastSpy.mockClear();
  // Silence the dev-mode warning that fires alongside the toast on
  // exhaustion — not what these tests assert.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // happy-dom doesn't implement scrollIntoView; the focus hook calls it
  // before focusing. A no-op shim is enough — these tests don't assert
  // on scroll, only on click + lookup behavior.
  Element.prototype.scrollIntoView = function () {} as Element["scrollIntoView"];
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useFocusFieldFromUrl — auto-expand contract (task #787)", () => {
  it("clicks the registered trigger and lands focus when the marker starts hidden", async () => {
    const FIELD = "capitalRaiseValuationCap";
    window.history.replaceState(null, "", `/?focus=${FIELD}`);

    render(
      <>
        <CollapsibleHarness fieldId={FIELD} />
        <HookHost maxAttempts={5} retryMs={5} />
      </>,
    );

    // Wait for the focus param to be stripped — the cleanest signal that
    // the hook ran to completion. With auto-expand, that completion has
    // to be the *success* branch (marker found), not the exhausted one.
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    // Marker is now in the DOM (the hook clicked the toggle and React
    // re-rendered with `open=true`).
    expect(document.querySelector(`[data-field="${FIELD}"]`)).not.toBeNull();
    // Toast must NOT fire on the happy path — that's the whole point of
    // auto-expand: the user gets the field, not an explanatory toast.
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("still fires the exhaust-budget toast when no expand trigger is registered", async () => {
    const FIELD = "fieldWithNoTrigger";
    window.history.replaceState(null, "", `/?focus=${FIELD}`);

    // No CollapsibleHarness mounted — there's nothing in the DOM that
    // claims to reveal `fieldWithNoTrigger`. The hook should fall
    // through to its existing exhaust-and-toast behavior.
    render(<HookHost maxAttempts={3} retryMs={5} />);

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledTimes(1);
    });
    // Param is still stripped on exhaustion — re-renders won't re-toast.
    expect(window.location.search).toBe("");
  });

  it("does not click a trigger that is already in the expanded state", async () => {
    // Initially-open harness: `aria-expanded="true"` on the toggle. The
    // hook must skip the click (clicking would close the section, hiding
    // the marker that's already visible).
    const FIELD = "alreadyOpenField";
    window.history.replaceState(null, "", `/?focus=${FIELD}`);

    let clickCount = 0;

    function Harness() {
      const [open, setOpen] = useState(true); // already open
      return (
        <div>
          <button
            type="button"
            data-expand-trigger={FIELD}
            aria-expanded={open}
            onClick={() => {
              clickCount += 1;
              setOpen((v) => !v);
            }}
            data-testid="already-open-toggle"
          >
            toggle
          </button>
          {open && <div data-field={FIELD} tabIndex={-1} />}
        </div>
      );
    }

    render(
      <>
        <Harness />
        <HookHost maxAttempts={5} retryMs={5} />
      </>,
    );

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    // The marker was visible from the start, so the focus hook found it
    // on the very first attempt without ever invoking auto-expand. The
    // toggle's onClick must not have run.
    expect(clickCount).toBe(0);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("matches the right trigger when one button advertises multiple fields", async () => {
    // Mirrors the FundingSection contract for the interest-rate Switch:
    // `data-expand-trigger="fundingInterestRate fundingInterestPaymentFrequency"`
    // — two field ids on a single trigger. Either field id must locate
    // the same toggle via the `[~="<id>"]` selector.
    const FIELD_A = "multiTriggerFieldA";
    const FIELD_B = "multiTriggerFieldB";
    window.history.replaceState(null, "", `/?focus=${FIELD_B}`);

    function MultiHarness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button
            type="button"
            data-expand-trigger={`${FIELD_A} ${FIELD_B}`}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            data-testid="multi-toggle"
          >
            toggle
          </button>
          {open && (
            <>
              <div data-field={FIELD_A} tabIndex={-1} />
              <div data-field={FIELD_B} tabIndex={-1} />
            </>
          )}
        </div>
      );
    }

    render(
      <>
        <MultiHarness />
        <HookHost maxAttempts={5} retryMs={5} />
      </>,
    );

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    // The toggle was clicked, both markers were rendered, the requested
    // one (FIELD_B) is now in the DOM, and no toast fired.
    expect(document.querySelector(`[data-field="${FIELD_B}"]`)).not.toBeNull();
    expect(toastSpy).not.toHaveBeenCalled();
  });
});
