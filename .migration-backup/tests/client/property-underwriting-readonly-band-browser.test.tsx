// @vitest-environment happy-dom
/**
 * Phase 4 (Constants doctrine) — runtime DOM browser test for the
 * Authority-Governed band embedded in the admin
 * **Property Underwriting** tab (`PropertyUnderwritingTab`).
 *
 * Companion to `tests/client/model-constants-tab-browser.test.tsx`,
 * which protects the dedicated Constants tab. This file protects the
 * second surface where specialist-owned values appear: the
 * "Model Constants — Authority-Governed" band at the top of
 * Property Underwriting (`section-model-constants-property-underwriting`),
 * which currently surfaces the IRS Pub 946 depreciation-years value as
 * a read-only display (`field-depreciationYears-readonly`).
 *
 * It asserts:
 *
 *   1. The Authority-Governed band is rendered for super_admins.
 *   2. ZERO editable elements live inside any `section-model-constants-*`
 *      container or any element whose data-testid ends with `-readonly`.
 *      "Editable" means: an `<input>` that is not `readOnly`/`disabled`
 *      and not of a non-text type (`hidden`, `button`, `submit`,
 *      `reset`, `image`, `checkbox`, `radio`); a `<textarea>` that is
 *      not `readOnly`/`disabled`; or `[contenteditable]` with any value
 *      other than `"false"`. A regression that ships an editable
 *      element into the band fails this test with a message that names
 *      the offending container by `data-testid`.
 *
 *   3. Future-proofing: if a future PR adds another
 *      `section-model-constants-*` band or `*-readonly` field to this
 *      tab, the same scan covers it automatically — no test edit
 *      required.
 *
 * Auth is mocked so the band actually renders (the band is
 * super_admin-gated; the same gate lives on the server). The fetch is
 * mocked to return the canonical United-States depreciation-years row
 * the read-only display reads from.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../../client/src/components/ui/tooltip";
import { PropertyUnderwritingTab } from "../../client/src/components/admin/model-defaults/PropertyUnderwritingTab";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "test-super", role: "super_admin" },
    isAdmin: true,
    isSuperAdmin: true,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function buildFetchMock() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("/api/admin/model-constants?")) {
      // Minimum shape consumed by PropertyUnderwritingTab's
      // depreciationYears query — see PropertyUnderwritingTab.tsx.
      return new Response(JSON.stringify({
        country: "United States",
        subdivision: null,
        items: [{ key: "depreciationYears", effectiveValue: 39 }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("", { status: 404 });
  });
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    React.createElement(
      QueryClientProvider, { client: queryClient },
      React.createElement(TooltipProvider, null,
        React.createElement(PropertyUnderwritingTab, {
          draft: {},
          onChange: () => {},
          guidance: [],
        }),
      ),
    ),
  );
}

beforeEach(() => {
  globalThis.fetch = buildFetchMock() as unknown as typeof fetch;
  // happy-dom + Radix Popover/Slider compatibility shims.
  Element.prototype.scrollIntoView = vi.fn();
  if (!(Element.prototype as unknown as { hasPointerCapture?: unknown }).hasPointerCapture) {
    (Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Returns true if the element is a user-editable text input,
 * textarea, or contenteditable. Read-only / disabled inputs and
 * non-text input types (hidden, checkbox, radio, button, submit,
 * reset, image) do NOT count — the doctrine only forbids "type a
 * value" surfaces, not toggles or hidden form-state inputs Radix
 * uses internally.
 */
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

function getReadOnlyContainers(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    '[data-testid^="section-model-constants-"], [data-testid$="-readonly"]',
  ));
}

describe("PropertyUnderwritingTab — Phase 4 read-only doctrine (Authority-Governed band)", () => {
  it("renders the Authority-Governed band for super_admins", async () => {
    renderTab();
    const band = await screen.findByTestId("section-model-constants-property-underwriting");
    expect(band).toBeTruthy();
    // The depreciation-years read-only field is the current resident.
    expect(band.querySelector('[data-testid="field-depreciationYears-readonly"]')).toBeTruthy();
  });

  it("contains ZERO editable elements inside any section-model-constants-* or *-readonly container", async () => {
    renderTab();
    await screen.findByTestId("section-model-constants-property-underwriting");

    const containers = getReadOnlyContainers();
    expect(containers.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const container of containers) {
      const editables = Array.from(container.querySelectorAll("input, textarea, [contenteditable]"))
        .filter(isUserEditable);
      if (editables.length > 0) {
        const id = container.getAttribute("data-testid") ?? "(no testid)";
        offenders.push(
          `${id}: ${editables.length} editable element(s) — ` +
          editables.map((e) => `<${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""}>`).join(", "),
        );
      }
    }
    if (offenders.length > 0) {
      const message = [
        "Phase 4 read-only doctrine broken on the admin Property Underwriting tab.",
        "Authority-governed values (IRS Pub 946 depreciation, etc.) are sourced",
        "from the Model Constants registry and written exclusively by AI",
        "Specialists — admins must never type a value here. The following",
        "container(s) rendered an editable element:",
        ...offenders.map((o) => `  • ${o}`),
        "",
        "See tests/browser/model-constants-tab-readonly.plan.md and",
        "client/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx.",
      ].join("\n");
      throw new Error(message);
    }
    expect(offenders).toEqual([]);
  });
});
