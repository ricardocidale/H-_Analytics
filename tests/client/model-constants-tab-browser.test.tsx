// @vitest-environment happy-dom
/**
 * Phase 4 (Constants doctrine) — runtime DOM browser test.
 *
 * Companion to `tests/client/model-constants-tab-readonly.test.tsx`,
 * which locks the contract on a single row (taxRate). This file
 * exercises the FULL admin Constants tab with EVERY specialist-owned
 * key from `MODEL_CONSTANTS_REGISTRY` mounted at once, then asserts:
 *
 *   1. No row card contains an editable element — zero `<input>`,
 *      zero `<textarea>`, zero `[contenteditable="true"]`. This catches
 *      a regression a static-grep test cannot: a child component that
 *      wraps an Input internally (e.g. a date picker, a hidden numeric
 *      stepper) would fail this real-DOM render check even though the
 *      ModelConstantsTab source greps clean.
 *
 *   2. Every row has the three required affordances — Specialist
 *      letter badge, "Refresh research" button, "History" button.
 *      Iterates the rendered DOM rather than a hand-maintained list,
 *      so adding a new key to the registry automatically tightens
 *      the test.
 *
 *   3. Clicking "Refresh research" opens a popover with a Previous /
 *      New diff and an evidence section, with both Apply and Discard
 *      buttons present. Clicking Discard closes the popover without
 *      issuing a write.
 *
 * Auth is irrelevant here because this is a component test —
 * <ModelConstantsTab /> is rendered directly with a mocked fetch.
 * Production access control lives on the server (`requireAdmin`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../../client/src/components/ui/tooltip";
import { ModelConstantsTab } from "../../client/src/components/admin/model-defaults/ModelConstantsTab";
import { MODEL_CONSTANTS_REGISTRY } from "../../shared/model-constants-registry";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

interface FakeRow {
  key: string;
  label: string;
  locality: "universal" | "country" | "country+state";
  authority: string;
  referenceUrl: string | null;
  helperText: string;
  requestedAt: { country: string | null; subdivision: string | null };
  scope: { locality: "universal" | "country" | "country+state"; country: string | null; subdivision: string | null };
  unit: "percent" | "years" | "days" | "ratio";
  factoryValue: number;
  factoryWasFallback: boolean;
  effectiveValue: number;
  source: "factory" | "analyst" | "manual";
  resolvedAt: "subdivision" | "country" | "universal" | null;
  override: null;
  specialistOwned: boolean;
  specialistId: string | null;
  specialistLetter: string | null;
  specialistName: string | null;
  lastRefreshedAt: string | null;
  latestResearchRun: {
    id: number;
    asOf: string | null;
    authority: string | null;
    value: unknown;
    sourcesCount: number;
    isDifferentFromCurrent: boolean;
  } | null;
  convictionSummary: string;
}

// Minimal Specialist letter assignment used purely to build a fake row
// per registry key. The mapping mirrors the production assignment
// (`server/specialists/...`) but is local to the test so a registry
// addition simply gets a synthesized letter "?" — the test still
// asserts a badge is present.
const SPECIALIST_LETTER_BY_KEY: Record<string, { id: string; letter: string; name: string }> = {
  taxRate:            { id: "constants.tax-research", letter: "H", name: "Tax research" },
  capitalGainsRate:   { id: "constants.tax-research", letter: "H", name: "Tax research" },
  costRateTaxes:      { id: "constants.tax-research", letter: "H", name: "Tax research" },
  inflationRate:      { id: "constants.macro-research", letter: "I", name: "Macro indicators" },
  countryRiskPremium: { id: "constants.macro-research", letter: "I", name: "Macro indicators" },
  depreciationYears:  { id: "constants.depreciation-research", letter: "J", name: "Depreciation" },
  daysPerMonth:       { id: "constants.reporting-research", letter: "K", name: "Reporting" },
};

function buildFakeRow(key: string): FakeRow {
  const reg = MODEL_CONSTANTS_REGISTRY[key];
  const spec = SPECIALIST_LETTER_BY_KEY[key] ?? { id: "specialist.unknown", letter: "?", name: "Unknown" };
  return {
    key,
    label: reg.label,
    locality: reg.locality,
    authority: "Test authority",
    referenceUrl: null,
    helperText: reg.meta.helperText,
    requestedAt: { country: reg.locality === "universal" ? null : "United States", subdivision: null },
    scope: {
      locality: reg.locality,
      country: reg.locality === "universal" ? null : "United States",
      subdivision: null,
    },
    unit: key === "depreciationYears" ? "years" : key === "daysPerMonth" ? "days" : "percent",
    factoryValue: 0.21,
    factoryWasFallback: false,
    effectiveValue: 0.21,
    source: "factory",
    resolvedAt: reg.locality === "universal" ? "universal" : "country",
    override: null,
    specialistOwned: true,
    specialistId: spec.id,
    specialistLetter: spec.letter,
    specialistName: spec.name,
    lastRefreshedAt: "2026-04-20T00:00:00Z",
    latestResearchRun: {
      id: 1000,
      asOf: "2026-04-20T00:00:00Z",
      authority: "Test authority",
      value: 0.21,
      sourcesCount: 2,
      isDifferentFromCurrent: false,
    },
    convictionSummary: "Verified against test authority (2 sources)",
  };
}

const ALL_REGISTRY_KEYS = Object.keys(MODEL_CONSTANTS_REGISTRY);
const ALL_FAKE_ROWS = ALL_REGISTRY_KEYS.map(buildFakeRow);

interface FetchCall { url: string; method: string; body: unknown }
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
        country: "United States", subdivision: null, items: ALL_FAKE_ROWS,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (method === "POST" && url.includes("/refresh")) {
      const keyMatch = url.match(/\/model-constants\/([^/?]+)\/refresh/);
      const key = keyMatch?.[1] ?? "unknown";
      return new Response(JSON.stringify({
        proposal: {
          key, label: MODEL_CONSTANTS_REGISTRY[key]?.label ?? key,
          country: "United States", subdivision: null,
          value: 0.30, authority: "Updated authority",
          referenceUrl: "https://example.test/ref",
          reasoning: "The statutory rate was updated for the 2026 tax year per the cited bulletin.",
          sources: [{ title: "Test bulletin", url: "https://example.test/bulletin" }],
          factoryValue: 0.21, currentValue: 0.21, isDifferentFromCurrent: true,
          researchRunId: 9001, specialistId: SPECIALIST_LETTER_BY_KEY[key]?.id ?? "specialist.unknown",
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
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
      QueryClientProvider, { client: queryClient },
      React.createElement(TooltipProvider, null,
        React.createElement(ModelConstantsTab),
      ),
    ),
  );
}

beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = buildFetchMock() as unknown as typeof fetch;
  // happy-dom + Radix Popover compatibility shims.
  Element.prototype.scrollIntoView = vi.fn();
  if (!(Element.prototype as unknown as { hasPointerCapture?: unknown }).hasPointerCapture) {
    (Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function getAllRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    '[data-testid^="row-model-constant-"]',
  ));
}

describe("ModelConstantsTab — Phase 4 read-only browser test (full registry)", () => {
  it("renders one card per specialist-owned constant from the registry", async () => {
    renderTab();
    await screen.findByTestId(`row-model-constant-${ALL_REGISTRY_KEYS[0]}`);
    const rows = getAllRows();
    expect(rows.length).toBe(ALL_REGISTRY_KEYS.length);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("contains ZERO editable elements (input/textarea/contenteditable) inside any row card", async () => {
    renderTab();
    await screen.findByTestId(`row-model-constant-${ALL_REGISTRY_KEYS[0]}`);
    const rows = getAllRows();

    let inputs = 0, textareas = 0, editables = 0;
    const offenders: string[] = [];
    for (const row of rows) {
      const ri = row.querySelectorAll("input").length;
      const rt = row.querySelectorAll("textarea").length;
      // contenteditable can be enabled with `true`, the empty string,
      // or "plaintext-only" — any value other than "false" makes the
      // element editable per the HTML spec. Match all of those so a
      // regression that uses a non-"true" form still fails the test.
      const re = row.querySelectorAll(
        '[contenteditable]:not([contenteditable="false"])',
      ).length;
      inputs += ri; textareas += rt; editables += re;
      if (ri || rt || re) {
        offenders.push(`${row.getAttribute("data-testid")}: ${ri} input, ${rt} textarea, ${re} contenteditable`);
      }
    }
    expect(
      { inputs, textareas, editables, offenders },
    ).toEqual({ inputs: 0, textareas: 0, editables: 0, offenders: [] });
  });

  it("renders a Specialist letter badge, Refresh research button, and History button on EVERY row", async () => {
    renderTab();
    await screen.findByTestId(`row-model-constant-${ALL_REGISTRY_KEYS[0]}`);

    const missing: string[] = [];
    for (const row of getAllRows()) {
      const key = row.getAttribute("data-testid")!.replace(/^row-model-constant-/, "");
      const badge = row.querySelector('[data-testid^="badge-specialist-"]');
      const refresh = within(row).queryByTestId(`button-refresh-research-${key}`);
      const history = within(row).queryByTestId(`button-history-${key}`);
      if (!badge) missing.push(`${key}: no specialist badge`);
      if (!refresh) missing.push(`${key}: no refresh research button`);
      if (!history) missing.push(`${key}: no history button`);
    }
    expect(missing).toEqual([]);
  });

  it("Refresh research opens a popover with Previous/New diff and an evidence section", async () => {
    const user = userEvent.setup();
    renderTab();
    const firstKey = ALL_REGISTRY_KEYS[0];
    await screen.findByTestId(`row-model-constant-${firstKey}`);

    await user.click(screen.getByTestId(`button-refresh-research-${firstKey}`));

    await waitFor(() => screen.getByTestId(`refresh-new-${firstKey}`));

    const popover = screen.getByTestId(`popover-refresh-research-${firstKey}`);
    expect(within(popover).getByTestId(`refresh-previous-${firstKey}`).textContent).toMatch(/\d/);
    expect(within(popover).getByTestId(`refresh-new-${firstKey}`).textContent).toMatch(/\d/);
    expect(popover.textContent ?? "").toMatch(/Previous/i);
    expect(popover.textContent ?? "").toMatch(/New/i);
    expect(popover.textContent ?? "").toMatch(/Authority/i);
    expect(popover.textContent ?? "").toMatch(/Evidence/i);
    expect(within(popover).getByTestId(`button-apply-refresh-${firstKey}`)).toBeTruthy();
    expect(within(popover).getByTestId(`button-discard-refresh-${firstKey}`)).toBeTruthy();
  });

  it("Discard closes the refresh popover without issuing an apply-proposal call", async () => {
    const user = userEvent.setup();
    renderTab();
    const firstKey = ALL_REGISTRY_KEYS[0];
    await screen.findByTestId(`row-model-constant-${firstKey}`);

    await user.click(screen.getByTestId(`button-refresh-research-${firstKey}`));
    await waitFor(() => screen.getByTestId(`refresh-new-${firstKey}`));

    await user.click(screen.getByTestId(`button-discard-refresh-${firstKey}`));

    // The popover must actually disappear from the DOM, not merely
    // skip the apply call — the user-visible affordance is closure.
    await waitFor(() => {
      expect(screen.queryByTestId(`popover-refresh-research-${firstKey}`)).toBeNull();
    });
    expect(fetchCalls.some((c) => c.url.includes("/apply-proposal"))).toBe(false);
  });
});
