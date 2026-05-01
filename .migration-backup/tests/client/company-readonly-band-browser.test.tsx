// @vitest-environment happy-dom
/**
 * Phase 4 (Constants doctrine) — runtime DOM browser test for the
 * admin **Management Company** Defaults tab (`CompanyTab`).
 *
 * Companion to `tests/client/model-constants-tab-browser.test.tsx`,
 * which protects the dedicated Constants tab. This file protects the
 * Management Company tab against a future regression where someone
 * embeds a specialist-owned value (e.g. blended company income tax
 * rate from a country tax registry) as an EDITABLE input rather than
 * a read-only display.
 *
 * The doctrine is enforced by a structural scan: any element whose
 * `data-testid` starts with `section-model-constants-` or ends with
 * `-readonly` is treated as an Authority-Governed container, and the
 * test asserts ZERO user-editable elements inside it. "Editable"
 * means: an `<input>` that is not `readOnly`/`disabled` and not of a
 * non-text type (`hidden`, `button`, `submit`, `reset`, `image`,
 * `checkbox`, `radio`); a `<textarea>` that is not
 * `readOnly`/`disabled`; or `[contenteditable]` with any value other
 * than `"false"`.
 *
 * Today CompanyTab does not yet host a `section-model-constants-*`
 * band — the company income tax rate is editable as a Default
 * (with the registry's US baseline as a fallback). The test still
 * runs and (a) confirms zero such containers exist, and (b) catches
 * the moment a PR adds one with an editable input. No test edit
 * required when the next governed value lands.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../../client/src/components/ui/tooltip";
import { CompanyTab } from "../../client/src/components/admin/model-defaults/CompanyTab";

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

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    React.createElement(
      QueryClientProvider, { client: queryClient },
      React.createElement(TooltipProvider, null,
        React.createElement(CompanyTab, {
          draft: {
            companyName: "Test Co",
            projectionYears: 10,
            baseManagementFee: 0.04,
            incentiveManagementFee: 0.10,
            companyTaxRate: 0.21,
            costOfEquity: 0.18,
          },
          onChange: () => {},
          guidance: [],
        }),
      ),
    ),
  );
}

beforeEach(() => {
  // Defensive fetch mock — CompanyTab does not call fetch today.
  globalThis.fetch = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
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

function getReadOnlyContainers(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    '[data-testid^="section-model-constants-"], [data-testid$="-readonly"]',
  ));
}

describe("CompanyTab — Phase 4 read-only doctrine (Authority-Governed bands)", () => {
  it("renders without crashing", () => {
    renderTab();
    expect(document.body.textContent).toContain("Company Name");
  });

  it("contains ZERO editable elements inside any section-model-constants-* or *-readonly container", () => {
    renderTab();

    const containers = getReadOnlyContainers();
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
        "Phase 4 read-only doctrine broken on the admin Management Company",
        "Defaults tab. Specialist-owned values (e.g. blended company tax",
        "rate from the country tax registry) must surface as a read-only",
        "display — admins must never type a value into an Authority-Governed",
        "band. The following container(s) rendered an editable element:",
        ...offenders.map((o) => `  • ${o}`),
        "",
        "See tests/browser/model-constants-tab-readonly.plan.md and",
        "client/src/components/admin/model-defaults/CompanyTab.tsx.",
      ].join("\n");
      throw new Error(message);
    }
    expect(offenders).toEqual([]);
  });
});
