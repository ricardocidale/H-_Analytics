// @vitest-environment happy-dom
/**
 * Phase 4 (Constants doctrine) — runtime DOM browser test for the
 * Authority-Governed band on the **property edit** page's
 * `CapitalStructureSection`. Companion to
 * `tests/client/property-underwriting-readonly-band-browser.test.tsx`,
 * which protects the admin Property Underwriting tab. Same shield-iconed
 * `section-model-constants-*` shell, same "ZERO editable elements
 * inside `*-readonly`" doctrine — just rendered on the editor surface.
 *
 * It asserts:
 *
 *   1. The Authority-Governed band is rendered on the property edit
 *      page next to depreciationYears
 *      (`section-model-constants-property-edit-depreciation`), with the
 *      shield-iconed header and a read-only echo
 *      (`field-depreciationYears-readonly`).
 *
 *   2. The read-only echo container holds ZERO user-editable inputs —
 *      only the labeled "Per-Property Override" input (which lives in a
 *      sibling `<div>`, not inside the `*-readonly` container) is
 *      editable. A regression that nests the override input inside the
 *      read-only container, or strips the `readOnly` attribute off the
 *      echo, fails this test with a message naming the offending
 *      container by `data-testid`.
 *
 *   3. The override input is present, editable, and clearly labeled
 *      "Per-Property Override" so the cascade
 *      (per-property → company → constant) is visible.
 *
 *   4. The band falls back to the static GOVERNED_FIELDS metadata when
 *      the admin endpoint 4xx's (the property-edit page is reachable by
 *      non-admins, who get 401 from `/api/admin/model-constants`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../../client/src/components/ui/tooltip";
import CapitalStructureSection from "../../client/src/components/property-edit/CapitalStructureSection";
import { GOVERNED_FIELDS } from "@shared/constants";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function buildFetchMock(opts: { authorized: boolean }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("/api/admin/model-constants?")) {
      if (!opts.authorized) {
        return new Response("forbidden", { status: 401 });
      }
      return new Response(
        JSON.stringify({
          country: "United States",
          subdivision: null,
          items: [{ key: "depreciationYears", effectiveValue: 39 }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("", { status: 404 });
  });
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Minimal property draft — only the fields the section reads. Cast
  // through unknown so we don't have to fabricate the entire
  // PropertyResponse just to render this one section in isolation.
  const draft = {
    id: 1,
    purchasePrice: 1_000_000,
    buildingImprovements: 0,
    preOpeningCosts: 0,
    operatingReserve: 0,
    landValuePercent: 0.25,
    depreciationYears: null,
    country: "United States",
    stateProvince: null,
    costSegEnabled: false,
  } as unknown as Parameters<typeof CapitalStructureSection>[0]["draft"];
  return render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        TooltipProvider,
        null,
        React.createElement(CapitalStructureSection, {
          draft,
          onChange: () => {},
          onNumberChange: () => {},
          globalAssumptions: undefined,
          researchValues: {},
        }),
      ),
    ),
  );
}

beforeEach(() => {
  // happy-dom + Radix Slider/Popover compatibility shims (see
  // property-underwriting-readonly-band-browser.test.tsx for the same
  // pair — Radix calls these and happy-dom doesn't ship them).
  Element.prototype.scrollIntoView = vi.fn();
  if (!(Element.prototype as unknown as { hasPointerCapture?: unknown }).hasPointerCapture) {
    (Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function isUserEditable(el: Element): boolean {
  const tag = el.tagName;
  if (tag === "INPUT") {
    const input = el as HTMLInputElement;
    if (input.readOnly || input.disabled) return false;
    const type = (input.getAttribute("type") || "text").toLowerCase();
    if (["hidden", "button", "submit", "reset", "image", "checkbox", "radio"].includes(type)) {
      return false;
    }
    return true;
  }
  if (tag === "TEXTAREA") {
    const ta = el as HTMLTextAreaElement;
    return !ta.readOnly && !ta.disabled;
  }
  const ce = el.getAttribute("contenteditable");
  if (ce !== null && ce.toLowerCase() !== "false") return true;
  return false;
}

describe("CapitalStructureSection — Phase 4 read-only doctrine (Authority-Governed band)", () => {
  it("renders the shield-iconed Authority-Governed band with the depreciationYears read-only echo", async () => {
    globalThis.fetch = buildFetchMock({ authorized: true }) as unknown as typeof fetch;
    renderSection();
    const band = await screen.findByTestId("section-model-constants-property-edit-depreciation");
    expect(band).toBeTruthy();
    // Shield-iconed header text proves we used the canonical band shell
    // (same wording as the admin tab's section header).
    expect(band.textContent ?? "").toContain("Model Constants — Authority-Governed");
    // The depreciationYears read-only field is the resident.
    const readonlyContainer = band.querySelector(
      '[data-testid="field-depreciationYears-readonly"]',
    );
    expect(readonlyContainer).toBeTruthy();
    // The echo input is a real <input readOnly>, not a disguised text
    // node — so screen readers see "read-only" and ZERO editable scan
    // (below) catches regressions.
    const echo = band.querySelector<HTMLInputElement>(
      '[data-testid="text-depreciationYears-readonly"]',
    );
    expect(echo).toBeTruthy();
    expect(echo!.tagName).toBe("INPUT");
    expect(echo!.readOnly).toBe(true);
  });

  it("contains ZERO editable elements inside the readonly container", async () => {
    globalThis.fetch = buildFetchMock({ authorized: true }) as unknown as typeof fetch;
    renderSection();
    const band = await screen.findByTestId("section-model-constants-property-edit-depreciation");
    const readonlyContainer = band.querySelector<HTMLElement>(
      '[data-testid="field-depreciationYears-readonly"]',
    );
    expect(readonlyContainer).toBeTruthy();
    const editables = Array.from(
      readonlyContainer!.querySelectorAll("input, textarea, [contenteditable]"),
    ).filter(isUserEditable);
    if (editables.length > 0) {
      const tags = editables.map((e) => `${e.tagName}#${e.getAttribute("data-testid") ?? "(no id)"}`).join(", ");
      throw new Error(
        `field-depreciationYears-readonly must contain ZERO user-editable elements. Found: ${tags}`,
      );
    }
    expect(editables.length).toBe(0);
  });

  it("renders the per-property override input as a sibling of the readonly echo (not nested inside it), labeled 'Per-Property Override'", async () => {
    globalThis.fetch = buildFetchMock({ authorized: true }) as unknown as typeof fetch;
    renderSection();
    const band = await screen.findByTestId("section-model-constants-property-edit-depreciation");
    const override = band.querySelector<HTMLInputElement>(
      '[data-testid="input-depreciation-years-override"]',
    );
    expect(override).toBeTruthy();
    expect(override!.tagName).toBe("INPUT");
    expect(override!.readOnly).toBe(false);
    expect(override!.disabled).toBe(false);
    // Must NOT be inside the readonly container — that would break the
    // doctrine scan above and confuse the cascade.
    const readonlyContainer = band.querySelector<HTMLElement>(
      '[data-testid="field-depreciationYears-readonly"]',
    );
    expect(readonlyContainer!.contains(override)).toBe(false);
    // Override label must be present and explicit.
    expect(band.textContent ?? "").toContain("Per-Property Override");
  });

  it("renders an in-app navigation link back to Admin → Model Defaults → Model Constants", async () => {
    globalThis.fetch = buildFetchMock({ authorized: true }) as unknown as typeof fetch;
    renderSection();
    const band = await screen.findByTestId("section-model-constants-property-edit-depreciation");
    const link = band.querySelector<HTMLButtonElement>(
      '[data-testid="link-nav-admin-model-constants"]',
    );
    expect(link).toBeTruthy();
    // It must be a real interactive element (button/anchor), not just
    // text — the architect flagged the original text-only copy as a UX
    // gap. button[type=button] is what we ship today.
    expect(["BUTTON", "A"].includes(link!.tagName)).toBe(true);
    expect(link!.textContent ?? "").toMatch(/Admin.*Model Defaults.*Model Constants/);
  });

  it("falls back to the static GOVERNED_FIELDS metadata when the admin endpoint is unauthorized (401)", async () => {
    globalThis.fetch = buildFetchMock({ authorized: false }) as unknown as typeof fetch;
    renderSection();
    const band = await screen.findByTestId("section-model-constants-property-edit-depreciation");
    const echo = band.querySelector<HTMLInputElement>(
      '[data-testid="text-depreciationYears-readonly"]',
    );
    expect(echo).toBeTruthy();
    // No live numeric value — fallback to the static "Varies by
    // country (US: 39 years)" string from GOVERNED_FIELDS.
    expect(echo!.value).toBe(GOVERNED_FIELDS.depreciationYears.value);
  });
});
