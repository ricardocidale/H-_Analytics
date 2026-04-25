// @vitest-environment happy-dom
/**
 * Task #493 — "Tools I build" section on the SpecialistPage.
 *
 * Locks the user-facing contract for the per-Specialist owned-tools
 * inspectability card:
 *   (a) Filters the SPECIALIST_TOOLS payload to entries whose
 *       owner.specialistId is this Specialist (and ONLY those entries).
 *   (b) Each row shows displayName, sourceFile, called-by names,
 *       lastBuiltAt freshness, and a navigation affordance back to the
 *       Resources surface.
 *   (c) Renders nothing when the Specialist owns no registered tools, so
 *       the page stays focused on capability tabs.
 *
 * This is the surface Letícia (Resource Builder, letter L) needs — her
 * capability tabs cover assignments + audit, but the deterministic-tools
 * work she does for the other 11 Specialists actually renders here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { SpecialistToolsIBuild } from "../../client/src/pages/admin/specialist/SpecialistToolsIBuild";

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
        { id: "mgmt-co.funding", humanName: "Ana", displayName: "Funding" },
      ],
      lastBuiltAt: new Date().toISOString(),
      lastBuiltSource: { kind: "build-time" },
    },
    {
      id: "tax-bulletin-diff",
      displayName: "Tax Bulletin Diff",
      description: "Deterministic-first proof tool for tax authority bulletins.",
      kind: "deterministic" as const,
      sourceFile: "server/ai/tools/tax-bulletin-diff.ts",
      citation: null,
      resourceSlug: null,
      owner: {
        specialistId: "constants.tax-research",
        humanName: "Helena",
        displayName: "Tax Authority Research",
      },
      calledBy: [
        { id: "constants.tax-research", humanName: "Helena", displayName: "Tax Authority Research" },
      ],
      lastBuiltAt: "2026-04-20T00:00:00Z",
      lastBuiltSource: { kind: "table", table: "tax_bulletin_cache" },
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

describe("SpecialistToolsIBuild (Task #493)", () => {
  beforeEach(() => {
    // stubGlobal so the mock survives any other suite that swapped out
    // globalThis.fetch (the same precaution the SpecialistToolsICall
    // suite uses — server tests in the full run can leave fetch in a
    // weird state).
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

  it("renders only tools whose owner is the Specialist", async () => {
    // Letícia owns regulatory-profiles + finance-compute (2 tools).
    renderWithProviders(<SpecialistToolsIBuild specialistId="resources.builder" />);

    await screen.findByTestId("row-tool-i-build-regulatory-profiles");
    await screen.findByTestId("row-tool-i-build-finance-compute");

    // Tools she does NOT own must not appear.
    expect(screen.queryByTestId("row-tool-i-build-tax-bulletin-diff")).toBeNull();

    // Count badge reflects the filtered set, not the catalog.
    expect(screen.getByTestId("badge-tools-i-build-count").textContent).toContain("2");
  });

  it("renders displayName, sourceFile, called-by, freshness, and a Resources link per row", async () => {
    renderWithProviders(<SpecialistToolsIBuild specialistId="resources.builder" />);

    await screen.findByTestId("row-tool-i-build-regulatory-profiles");

    expect(
      screen.getByTestId("text-tool-i-build-name-regulatory-profiles").textContent,
    ).toContain("Regulatory Profiles");
    expect(
      screen.getByTestId("text-tool-i-build-source-regulatory-profiles").textContent,
    ).toContain("shared/regulatory/profiles-na.ts");

    // Called-by list surfaces consuming Specialists by humanName.
    const calledBy =
      screen.getByTestId("text-tool-i-build-called-by-regulatory-profiles").textContent ?? "";
    expect(calledBy).toContain("Helena");
    expect(calledBy).toContain("Daniela");

    // Freshness rendered as a relative date (date-fns "ago" suffix).
    const freshness =
      screen.getByTestId("text-tool-i-build-freshness-regulatory-profiles").textContent ?? "";
    expect(freshness).toMatch(/last refreshed/);

    // build-time tool gets the "since deploy" suffix.
    const buildFreshness =
      screen.getByTestId("text-tool-i-build-freshness-finance-compute").textContent ?? "";
    expect(buildFreshness).toContain("since deploy");

    // Resources link present per row.
    expect(screen.getByTestId("link-tool-i-build-resources-regulatory-profiles")).toBeTruthy();
    expect(screen.getByTestId("link-tool-i-build-resources-finance-compute")).toBeTruthy();
  });

  it("also renders for non-Letícia owners (Helena owns tax-bulletin-diff)", async () => {
    renderWithProviders(<SpecialistToolsIBuild specialistId="constants.tax-research" />);

    await screen.findByTestId("row-tool-i-build-tax-bulletin-diff");

    // Letícia's tools must not appear under Helena.
    expect(screen.queryByTestId("row-tool-i-build-regulatory-profiles")).toBeNull();
    expect(screen.queryByTestId("row-tool-i-build-finance-compute")).toBeNull();

    expect(screen.getByTestId("badge-tools-i-build-count").textContent).toContain("1");
  });

  it("renders nothing when the Specialist owns no registered tools", async () => {
    const { container } = renderWithProviders(
      <SpecialistToolsIBuild specialistId="some.unknown-specialist" />,
    );
    // While loading the component renders a placeholder card; once the
    // registry resolves and zero tools match, the entire card is hidden.
    await waitFor(() => {
      expect(container.querySelector('[data-testid="card-specialist-tools-i-build"]')).toBeNull();
    });
  });
});
