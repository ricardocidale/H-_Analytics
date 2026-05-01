// @vitest-environment happy-dom
/**
 * Task #333 — Stop the Assumptions page from overwriting unsaved edits.
 *
 * Locks the contract that `useCompanyAssumptionsForm` will NOT clobber the
 * user's `formData` when react-query hands us a fresh `global` snapshot in
 * the middle of an edit. Instead, the new snapshot is stashed and the hook
 * exposes:
 *   - `hasPendingServerUpdate` (true while a stashed snapshot is waiting)
 *   - `discardEditsAndRefresh()` (opt-in: drop edits, apply server snapshot)
 *
 * Without this fix, a background refetch (mutation success, focus refetch,
 * polling, etc.) would silently overwrite whatever the user was typing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useCompanyAssumptionsForm,
} from "../../../client/src/hooks/useCompanyAssumptionsForm";
import type { GlobalResponse } from "../../../client/src/lib/api";
import { useScenarioDirtyState } from "../../../client/src/lib/scenario-dirty-state";

function makeGlobal(over: Partial<GlobalResponse> = {}): GlobalResponse {
  return {
    id: 1,
    companyName: "Acme Hospitality",
    companyCountry: "US",
    companyCity: "Austin",
    companyAddress: "1 Main St",
    companyOpsStartDate: "2024-01-01",
    modelStartDate: "2024-01-01",
    projectionYears: 10,
    companyInflationRate: 3,
    inflationRate: 3,
    depreciationYears: 27,
    companyTaxRate: 21,
    costOfEquity: 12,
    staffSalary: 60000,
    exitCapRate: 8,
    salesCommissionRate: 5,
    savedTabs: [],
    lastAssumptionChangeAt: null,
    ...over,
  } as unknown as GlobalResponse;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const noopToast = vi.fn();

beforeEach(() => {
  // The hook fires two background queries (acknowledgments + exit multiples)
  // on mount via fetch. Stub fetch so the queries resolve quickly with empty
  // arrays — these queries are not under test here.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => [],
    })) as unknown as typeof fetch,
  );
  // Reset the shared zustand store between tests so isDirty doesn't leak.
  useScenarioDirtyState.getState().clearDirty();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useScenarioDirtyState.getState().clearDirty();
});

describe("useCompanyAssumptionsForm — background refetch protection (task #333)", () => {
  it("hydrates formData from the initial global", () => {
    const initial = makeGlobal();
    const { result } = renderHook(
      () =>
        useCompanyAssumptionsForm({
          global: initial,
          isUpdatePending: false,
          mutateAsync: vi.fn(),
          toast: noopToast,
        }),
      { wrapper },
    );

    expect(result.current.formData.companyName).toBe("Acme Hospitality");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasPendingServerUpdate).toBe(false);
  });

  it("does NOT overwrite unsaved edits when global is refetched mid-edit", () => {
    const initial = makeGlobal();
    let currentGlobal: GlobalResponse = initial;

    const { result, rerender } = renderHook(
      () =>
        useCompanyAssumptionsForm({
          global: currentGlobal,
          isUpdatePending: false,
          mutateAsync: vi.fn(),
          toast: noopToast,
        }),
      { wrapper },
    );

    // User starts editing the company name.
    act(() => {
      result.current.handleUpdate("companyName", "Acme NEW Name");
    });
    expect(result.current.formData.companyName).toBe("Acme NEW Name");
    expect(result.current.isDirty).toBe(true);

    // Background refetch returns a different server snapshot.
    currentGlobal = makeGlobal({ companyName: "Acme STALE Server Name" });
    rerender();

    // The user's typing must be preserved.
    expect(result.current.formData.companyName).toBe("Acme NEW Name");
    // And the affordance must light up so they know newer data exists.
    expect(result.current.hasPendingServerUpdate).toBe(true);
  });

  it("does not flag a pending update if global is unchanged after the user starts editing", () => {
    const initial = makeGlobal();
    const { result, rerender } = renderHook(
      () =>
        useCompanyAssumptionsForm({
          global: initial,
          isUpdatePending: false,
          mutateAsync: vi.fn(),
          toast: noopToast,
        }),
      { wrapper },
    );

    act(() => {
      result.current.handleUpdate("companyName", "Acme NEW Name");
    });
    // No new server snapshot — re-running the effect with the same `global`
    // ref must NOT spuriously flag a pending update.
    rerender();
    expect(result.current.hasPendingServerUpdate).toBe(false);
  });

  it("discardEditsAndRefresh applies the stashed snapshot and clears dirty state", () => {
    const initial = makeGlobal();
    let currentGlobal: GlobalResponse = initial;

    const { result, rerender } = renderHook(
      () =>
        useCompanyAssumptionsForm({
          global: currentGlobal,
          isUpdatePending: false,
          mutateAsync: vi.fn(),
          toast: noopToast,
        }),
      { wrapper },
    );

    // Edit, then receive a fresh server snapshot.
    act(() => {
      result.current.handleUpdate("companyName", "Acme Local Edit");
    });
    currentGlobal = makeGlobal({ companyName: "Acme Server Truth" });
    rerender();
    expect(result.current.formData.companyName).toBe("Acme Local Edit");
    expect(result.current.hasPendingServerUpdate).toBe(true);

    // User opts to discard their edits.
    act(() => {
      result.current.discardEditsAndRefresh();
    });

    expect(result.current.formData.companyName).toBe("Acme Server Truth");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.dirtyFields.size).toBe(0);
    expect(result.current.hasPendingServerUpdate).toBe(false);
  });
});
