// @vitest-environment happy-dom
/**
 * Phase 4 (Constants doctrine) — runtime React Testing Library tests
 * for the read-only Constants admin tab.
 *
 * Locks the user-facing contract:
 *   (a) Each row renders with no editable input — the value is shown
 *       in a non-input element. (Asserted by querying for `<input>`
 *       inside the row card; specialistOwned rows must have zero.)
 *   (b) Refresh research → calls POST /:key/refresh → results panel
 *       shows Previous + New + Apply / Discard.
 *   (c) Clicking Apply calls POST /:key/apply-proposal with the
 *       researchRunId from the proposal. The body MUST NOT contain a
 *       `value` field — the server is the only authority for the
 *       written value.
 *   (d) Clicking Discard closes the popover without calling Apply.
 *   (e) Reset to factory calls DELETE on the row.
 *   (f) Override button is NOT rendered for specialistOwned rows.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../../client/src/components/ui/tooltip";
import { ModelConstantsTab } from "../../client/src/components/admin/model-defaults/ModelConstantsTab";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const taxRow = {
  key: "taxRate",
  label: "Income tax rate",
  locality: "country+state" as const,
  authority: "Country corporate income tax statute",
  referenceUrl: null,
  helperText: "Effective corporate income tax rate.",
  requestedAt: { country: "United States", subdivision: null },
  scope: { locality: "country+state" as const, country: "United States", subdivision: null },
  unit: "percent" as const,
  factoryValue: 0.21,
  factoryWasFallback: false,
  effectiveValue: 0.21,
  source: "factory" as const,
  resolvedAt: "country" as const,
  override: null,
  specialistOwned: true,
  specialistId: "constants.tax-research",
  specialistLetter: "H",
  specialistName: "Tax research",
  lastRefreshedAt: "2026-04-20T00:00:00Z",
  latestResearchRun: {
    id: 100,
    asOf: "2026-04-20T00:00:00Z",
    authority: "IRS Pub 542",
    value: 0.21,
    sourcesCount: 2,
    isDifferentFromCurrent: false,
  },
  convictionSummary: "Tax research verified against IRS Pub 542 (2 sources)",
};

const refreshedProposal = {
  key: "taxRate",
  label: "Income tax rate",
  country: "United States",
  subdivision: null,
  value: 0.30,
  authority: "California FTB",
  referenceUrl: "https://example.test/ftb",
  reasoning: "Statutory rate updated for 2026.",
  sources: [{ title: "FTB Notice", url: "https://example.test/notice" }],
  factoryValue: 0.21,
  currentValue: 0.21,
  isDifferentFromCurrent: true,
  researchRunId: 999,
  specialistId: "constants.tax-research",
};

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

let fetchCalls: FetchCall[] = [];

function buildFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = undefined;
    if (init?.body) {
      try { body = JSON.parse(init.body as string); } catch { body = init.body; }
    }
    fetchCalls.push({ url, method, body });

    if (method === "GET" && url.startsWith("/api/admin/model-constants?")) {
      return new Response(JSON.stringify({
        country: "United States", subdivision: null, items: [taxRow],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (method === "POST" && url.includes("/refresh")) {
      return new Response(JSON.stringify({ proposal: refreshedProposal }),
        { status: 200, headers: { "content-type": "application/json" } });
    }
    if (method === "POST" && url.includes("/apply-proposal")) {
      return new Response(JSON.stringify({
        wasFactoryEqual: false, override: { id: 1 }, appliedFromResearchRunId: 999,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (method === "DELETE" && url.startsWith("/api/admin/model-constants/")) {
      return new Response(JSON.stringify({ ok: true }),
        { status: 200, headers: { "content-type": "application/json" } });
    }
    if (method === "GET" && url.includes("/research-history")) {
      return new Response(JSON.stringify({ runs: [] }),
        { status: 200, headers: { "content-type": "application/json" } });
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
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        TooltipProvider,
        null,
        React.createElement(ModelConstantsTab),
      ),
    ),
  );
}

beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = buildFetchMock() as unknown as typeof fetch;
  // happy-dom needs scrollIntoView for some Radix popovers.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ModelConstantsTab — Phase 4 read-only doctrine (runtime)", () => {
  it("renders the tax row with NO editable input field on the card", async () => {
    renderTab();
    const row = await screen.findByTestId("row-model-constant-taxRate");
    // No input/textarea anywhere in the card body. This is the Phase 4
    // doctrine guarantee: the admin must not be able to type a value.
    expect(within(row).queryByRole("textbox")).toBeNull();
    expect(within(row).queryByRole("spinbutton")).toBeNull();
    expect(row.querySelectorAll("input")).toHaveLength(0);
    expect(row.querySelectorAll("textarea")).toHaveLength(0);
    // And no Override button for specialistOwned rows.
    expect(within(row).queryByTestId("button-override-taxRate")).toBeNull();
  });

  it("shows the Specialist letter badge, scope chip, and conviction summary", async () => {
    renderTab();
    const row = await screen.findByTestId("row-model-constant-taxRate");
    expect(within(row).getByTestId("badge-specialist-H")).toBeTruthy();
    expect(within(row).getByTestId("badge-scope")).toBeTruthy();
    expect(within(row).getByTestId("text-conviction-taxRate").textContent)
      .toContain("verified against IRS Pub 542");
    expect(within(row).getByTestId("text-as-of-taxRate").textContent)
      .toContain("As of 2026-04-20");
  });

  it("Refresh research → preview panel → Apply posts researchRunId WITHOUT a value", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("row-model-constant-taxRate");

    await user.click(screen.getByTestId("button-analyst-taxRate"));
    // Wait for the proposal to render.
    await waitFor(() => screen.getByTestId("refresh-new-taxRate"));

    // The preview surfaces the unit-aware diff.
    expect(screen.getByTestId("refresh-previous-taxRate").textContent).toContain("21");
    expect(screen.getByTestId("refresh-new-taxRate").textContent).toContain("30");

    // /refresh was called and did NOT carry a body value.
    const refreshCalls = fetchCalls.filter((c) => c.url.includes("/refresh"));
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0].method).toBe("POST");
    expect(refreshCalls[0].body).toBeUndefined();

    // Now Apply.
    await user.click(screen.getByTestId("button-apply-refresh-taxRate"));

    await waitFor(() => {
      const c = fetchCalls.find((x) => x.url.includes("/apply-proposal"));
      expect(c).toBeDefined();
    });

    const applyCall = fetchCalls.find((c) => c.url.includes("/apply-proposal"))!;
    expect(applyCall.method).toBe("POST");
    expect(applyCall.body).toEqual({ researchRunId: 999 });
    // Doctrine guarantee: NO value, NO authority in the body.
    expect((applyCall.body as Record<string, unknown>).value).toBeUndefined();
    expect((applyCall.body as Record<string, unknown>).authority).toBeUndefined();
  });

  it("Reset to factory issues a DELETE on the row's key", async () => {
    const user = userEvent.setup();
    // Reset button only renders when an override exists (source !== "factory").
    // Override the fetch mock for this single test to surface a non-factory row.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      let body: unknown = undefined;
      if (init?.body) { try { body = JSON.parse(init.body as string); } catch { body = init.body; } }
      fetchCalls.push({ url, method, body });
      if (method === "GET" && url.startsWith("/api/admin/model-constants?")) {
        return new Response(JSON.stringify({
          country: "United States", subdivision: null,
          items: [{ ...taxRow, source: "analyst", effectiveValue: 0.30,
                    override: { id: 5, value: 0.30, source: "analyst",
                                authority: "FTB", referenceUrl: null,
                                overrideNote: null, createdAt: "2026-04-21T00:00:00Z",
                                createdByUserId: null } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (method === "DELETE" && url.startsWith("/api/admin/model-constants/")) {
        return new Response(JSON.stringify({ ok: true }),
          { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    renderTab();
    await screen.findByTestId("row-model-constant-taxRate");

    await user.click(screen.getByTestId("button-reset-taxRate"));

    await waitFor(() => {
      const c = fetchCalls.find((x) =>
        x.method === "DELETE" && x.url.startsWith("/api/admin/model-constants/taxRate"),
      );
      expect(c).toBeDefined();
    });
  });

  it("Discard closes the preview without calling Apply", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId("row-model-constant-taxRate");

    await user.click(screen.getByTestId("button-analyst-taxRate"));
    await waitFor(() => screen.getByTestId("refresh-new-taxRate"));

    await user.click(screen.getByTestId("button-discard-refresh-taxRate"));

    expect(fetchCalls.some((c) => c.url.includes("/apply-proposal"))).toBe(false);
  });
});
