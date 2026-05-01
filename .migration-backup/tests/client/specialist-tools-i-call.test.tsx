// @vitest-environment happy-dom
/**
 * Task #463 — "Tools I call" section on the Specialist page.
 *
 * Locks the user-facing contract for the per-Specialist tool freshness
 * card:
 *   (a) Filters the SPECIALIST_TOOLS payload to entries whose calledBy
 *       includes this Specialist (and ONLY those entries).
 *   (b) Each row shows displayName, sourceFile, lastBuiltAt freshness,
 *       and a navigation affordance back to the Resources surface.
 *   (c) Renders nothing when the Specialist calls no registered tools,
 *       so the page stays focused on capability tabs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { SpecialistToolsICall } from "../../client/src/pages/admin/specialist/SpecialistToolsICall";

const mockResponse = {
  catalogSize: 12,
  tools: [
    {
      id: "regulatory-profiles",
      displayName: "Regulatory Profiles",
      description: "Static lookup of country-level licensing.",
      kind: "deterministic" as const,
      sourceFile: "shared/regulatory/profiles-na.ts",
      citation: null,
      resourceSlug: null,
      owner: {
        specialistId: "resources.builder",
        humanName: "Letícia",
        displayName: "Resource Builder",
      },
      calledBy: [
        { id: "constants.tax-research", humanName: "Helena", displayName: "Tax Authority Research" },
        { id: "property.risk-intelligence", humanName: "Daniela", displayName: "Risk Intelligence" },
      ],
      lastBuiltAt: "2026-04-13T00:00:00Z",
      lastBuiltSource: { kind: "static", isoDate: "2026-04-13" },
    },
    {
      id: "finance-compute",
      displayName: "Deterministic Finance Compute",
      description: "Pure-code property financials engine.",
      kind: "deterministic" as const,
      sourceFile: "engine/property/property-engine.ts",
      citation: null,
      resourceSlug: null,
      owner: {
        specialistId: "resources.builder",
        humanName: "Letícia",
        displayName: "Resource Builder",
      },
      calledBy: [
        { id: "mgmt-co.funding", humanName: "Aline", displayName: "Funding" },
      ],
      lastBuiltAt: new Date().toISOString(),
      lastBuiltSource: { kind: "build-time" },
    },
    {
      id: "vector-store-snapshots",
      displayName: "Vector Store Snapshots",
      description: "pgvector-backed semantic store.",
      kind: "deterministic" as const,
      sourceFile: "server/ai/vector-store-service.ts",
      citation: null,
      resourceSlug: null,
      owner: {
        specialistId: "resources.builder",
        humanName: "Letícia",
        displayName: "Resource Builder",
      },
      calledBy: [
        { id: "mgmt-co.funding", humanName: "Aline", displayName: "Funding" },
      ],
      lastBuiltAt: "2026-04-20T00:00:00Z",
      lastBuiltSource: { kind: "table", table: "vector_chunks" },
    },
  ],
};

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { hook } = memoryLocation({ path: "/" });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>{ui}</Router>
    </QueryClientProvider>,
  );
}

describe("SpecialistToolsICall (Task #463)", () => {
  beforeEach(() => {
    // Use stubGlobal so the mock survives any other suite that swapped
    // out globalThis.fetch (vi.spyOn would only restore to whatever the
    // previous suite installed, not the original, which has bitten us
    // when this file is run after server tests in the full suite).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders only tools whose calledBy includes the Specialist", async () => {
    // Helena (constants.tax-research) calls regulatory-profiles only.
    renderWithProviders(<SpecialistToolsICall specialistId="constants.tax-research" />);

    await screen.findByTestId("row-tool-i-call-regulatory-profiles");

    // Tools she does NOT call must not appear.
    expect(screen.queryByTestId("row-tool-i-call-finance-compute")).toBeNull();
    expect(screen.queryByTestId("row-tool-i-call-vector-store-snapshots")).toBeNull();

    // Count badge reflects the filtered set, not the catalog.
    expect(screen.getByTestId("badge-tools-i-call-count").textContent).toContain("1");
  });

  it("renders displayName, sourceFile, freshness, and a Resources link per row", async () => {
    renderWithProviders(<SpecialistToolsICall specialistId="mgmt-co.funding" />);

    await screen.findByTestId("row-tool-i-call-finance-compute");

    expect(screen.getByTestId("text-tool-i-call-name-finance-compute").textContent)
      .toContain("Deterministic Finance Compute");
    expect(screen.getByTestId("text-tool-i-call-source-finance-compute").textContent)
      .toContain("engine/property/property-engine.ts");

    // build-time tool gets the "since deploy" suffix.
    const buildFreshness = screen.getByTestId("text-tool-i-call-freshness-finance-compute").textContent ?? "";
    expect(buildFreshness).toMatch(/last refreshed/);
    expect(buildFreshness).toContain("since deploy");

    // Table-backed tool just renders the relative date.
    const tableFreshness = screen.getByTestId("text-tool-i-call-freshness-vector-store-snapshots").textContent ?? "";
    expect(tableFreshness).toMatch(/last refreshed/);

    // Resources link present per row.
    expect(screen.getByTestId("link-tool-i-call-resources-finance-compute")).toBeTruthy();
    expect(screen.getByTestId("link-tool-i-call-resources-vector-store-snapshots")).toBeTruthy();
  });

  it("renders nothing when the Specialist calls no registered tools", async () => {
    const { container } = renderWithProviders(
      <SpecialistToolsICall specialistId="some.unknown-specialist" />,
    );
    // Wait for the fetch-driven query to settle. While loading the
    // component renders a placeholder card; once the registry resolves
    // and zero tools match, the entire card is hidden.
    await waitFor(() => {
      expect(container.querySelector('[data-testid="card-specialist-tools-i-call"]')).toBeNull();
    });
  });
});
