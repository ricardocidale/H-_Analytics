// @vitest-environment happy-dom
/**
 * Phase 2b — Letícia toolbox card.
 *
 * Locks the user-facing contract for the Resources-page identity header
 * + per-tool inspectability strip:
 *   (a) Renders the Letícia identity header sourced from the Specialist
 *       catalog (not a hardcoded string).
 *   (b) Renders one row per tool returned by /api/admin/specialist-tools
 *       with owner attribution, freshness, and called-by names.
 *   (c) Loud-fail UI when the endpoint errors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LeticiaToolbox from "../../client/src/components/admin/resources/LeticiaToolbox";

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
  ],
};

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("LeticiaToolbox (Phase 2b inspectability)", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch" as never).mockImplementation((async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders the Letícia identity header sourced from the catalog", async () => {
    renderWithClient(<LeticiaToolbox />);
    const header = await screen.findByTestId("text-leticia-header");
    // Catalog-driven, not a hardcoded string — assert all three pieces.
    expect(header.textContent).toContain("Letícia");
    expect(header.textContent).toContain("Resource Builder");
    expect(header.textContent).toContain("Specialist L");
  });

  it("renders one row per tool with owner / freshness / called-by metadata", async () => {
    renderWithClient(<LeticiaToolbox />);
    await screen.findByTestId("row-tool-regulatory-profiles");

    // Owner attribution collapses to "Letícia" when she owns the tool.
    expect(screen.getByTestId("text-tool-meta-regulatory-profiles").textContent)
      .toContain("Letícia");

    // Called-by string lists the specialists' humanNames.
    const calledBy = screen.getByTestId("text-tool-called-by-regulatory-profiles").textContent ?? "";
    expect(calledBy).toContain("Helena");
    expect(calledBy).toContain("Daniela");

    // Freshness rendered as a relative date (date-fns "ago" suffix).
    const freshness = screen.getByTestId("text-tool-freshness-regulatory-profiles").textContent ?? "";
    expect(freshness).toMatch(/last refreshed/);

    // build-time tool surfaces the "since deploy" suffix.
    const buildFreshness = screen.getByTestId("text-tool-freshness-finance-compute").textContent ?? "";
    expect(buildFreshness).toContain("since deploy");
  });

  it("surfaces a loud failure when the endpoint errors", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch" as never).mockImplementation((async () =>
      new Response("boom", { status: 500 })) as never);

    renderWithClient(<LeticiaToolbox />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load Letícia/)).toBeTruthy();
    });
  });
});
