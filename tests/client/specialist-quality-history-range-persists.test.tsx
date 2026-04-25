// @vitest-environment happy-dom
/**
 * Task #562 — Persist the admin's selected quality-history window
 * across page reloads / re-mounts.
 *
 * Locks the contract that:
 *   (a) On first visit (nothing stored), the toggle defaults to 30d.
 *   (b) Clicking 7 / 30 / 90 writes the choice to localStorage under
 *       the canonical key.
 *   (c) On a subsequent mount with a stored value, the toggle opens
 *       in that window — not back to 30 — and the legend reflects it.
 *   (d) A bogus / out-of-range stored value falls back to 30 instead
 *       of trusting localStorage blindly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResourceAssignmentsTab } from "../../client/src/pages/admin/specialist/tabs/ResourceAssignmentsTab";

const SPECIALIST_ID = "helena";
const STORAGE_KEY = "hp-admin-specialist-quality-history-range";

function buildQuality() {
  return {
    specialistId: SPECIALIST_ID,
    score: 84,
    gaps: [],
    signals: {},
    computedAt: "2026-04-25T00:00:00Z",
  };
}

function buildHistory() {
  return {
    specialistId: SPECIALIST_ID,
    points: [
      { computedAt: "2026-04-24T00:00:00Z", score: 82 },
      { computedAt: "2026-04-25T00:00:00Z", score: 84 },
    ],
  };
}

const fetchSpy = vi.fn();
function lastHistoryLimit(): number | null {
  for (let i = fetchSpy.mock.calls.length - 1; i >= 0; i--) {
    const url = String(fetchSpy.mock.calls[i][0]);
    const m = url.match(/\/quality\/history\?limit=(\d+)/);
    if (m) return Number(m[1]);
  }
  return null;
}

function renderTab() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ResourceAssignmentsTab specialistId={SPECIALIST_ID} assignments={[]} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(`/quality`)) {
      return { ok: true, json: async () => buildQuality() } as Response;
    }
    if (url.includes(`/quality/history`)) {
      return { ok: true, json: async () => buildHistory() } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
  vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Specialist quality history range — persistence (task #562)", () => {
  it("defaults to 30d when nothing is stored", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTestId("quality-history-range")).toBeTruthy();
    });
    const btn30 = screen.getByTestId("button-quality-history-range-30");
    expect(btn30.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("quality-history-legend").textContent).toContain("30");
    await waitFor(() => expect(lastHistoryLimit()).toBe(30));
  });

  it("writes the selected range to localStorage when clicked", async () => {
    renderTab();
    await waitFor(() => screen.getByTestId("button-quality-history-range-90"));
    fireEvent.click(screen.getByTestId("button-quality-history-range-90"));
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe("90");
    });
    const btn90 = screen.getByTestId("button-quality-history-range-90");
    expect(btn90.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("quality-history-legend").textContent).toContain("90");
    await waitFor(() => expect(lastHistoryLimit()).toBe(90));
  });

  it("opens in the stored range on a fresh mount", async () => {
    localStorage.setItem(STORAGE_KEY, "7");
    renderTab();
    await waitFor(() => screen.getByTestId("button-quality-history-range-7"));
    const btn7 = screen.getByTestId("button-quality-history-range-7");
    expect(btn7.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("quality-history-legend").textContent).toContain("7");
    await waitFor(() => expect(lastHistoryLimit()).toBe(7));
  });

  it("falls back to 30d when the stored value is not a valid range", async () => {
    localStorage.setItem(STORAGE_KEY, "365");
    renderTab();
    await waitFor(() => screen.getByTestId("button-quality-history-range-30"));
    const btn30 = screen.getByTestId("button-quality-history-range-30");
    expect(btn30.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(lastHistoryLimit()).toBe(30));
  });
});
