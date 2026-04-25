// @vitest-environment happy-dom
/**
 * Task #508 — Sources tab health lights must update without a page refresh.
 *
 * Locks the contract that:
 *   (a) Pressing per-card "Test" updates THAT card's dot in place
 *       on success/failure (no manual reload required).
 *   (b) Pressing the bulk "Test sources" button refreshes ALL cards'
 *       dots in place from the server's per-resource result rows.
 *
 * The dot is rendered as `<span data-testid="source-card-status-{id}"
 * data-status="green|red|gray">`, so we assert directly on the
 * `data-status` attribute before and after the test action.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SourcesTab } from "../../client/src/pages/admin/specialist/tabs/SourcesTab";

const SPECIALIST_ID = "helena";
const TARGET = `specialist:${SPECIALIST_ID}`;

function buildSources() {
  return {
    target: TARGET,
    groups: [
      {
        group: "tables",
        label: "Tables",
        cards: [
          {
            resource: {
              id: 101,
              slug: "fred",
              displayName: "FRED",
              description: null,
              kind: "data_source",
            },
            group: "tables",
            health: {
              status: "red",
              lastChecked: "2026-04-24T10:00:00Z",
              lastStatus: "fail",
              lastErrorCode: "timeout",
            },
            fromCatalog: true,
            fromAdminConnection: true,
          },
          {
            resource: {
              id: 102,
              slug: "str",
              displayName: "STR",
              description: null,
              kind: "data_source",
            },
            group: "tables",
            health: {
              status: "gray",
              lastChecked: null,
              lastStatus: null,
              lastErrorCode: null,
            },
            fromCatalog: false,
            fromAdminConnection: true,
          },
        ],
      },
      { group: "apis", label: "APIs", cards: [] },
      { group: "uploaded-files", label: "Uploaded files", cards: [] },
      { group: "bulk-sources", label: "Bulk sources", cards: [] },
    ],
  };
}

interface FetchHandlers {
  bulk?: (init?: RequestInit) => unknown;
  perCard?: (id: number, init?: RequestInit) => unknown;
}

function mockFetch(handlers: FetchHandlers) {
  vi.spyOn(globalThis, "fetch" as never).mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = typeof input === "string" ? input : input.toString();
    let body: unknown;
    if (url.endsWith(`/api/admin/specialists/${SPECIALIST_ID}/sources/test-all`)) {
      if (!handlers.bulk) throw new Error(`Unexpected bulk call: ${url}`);
      body = handlers.bulk(init);
    } else if (url.endsWith(`/api/admin/specialists/${SPECIALIST_ID}/sources`)) {
      body = buildSources();
    } else {
      const m = url.match(/\/api\/admin\/resources\/(\d+)\/test$/);
      if (m && handlers.perCard) {
        body = handlers.perCard(Number(m[1]), init);
      } else {
        throw new Error(`Unmocked URL: ${url}`);
      }
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as never);
}

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        // Mirror the production default queryFn (client/src/lib/queryClient.ts):
        // it fetches `queryKey.join("/")` so plain `useQuery({ queryKey: [url] })`
        // works without a per-call queryFn.
        queryFn: async ({ queryKey }) => {
          const url = (queryKey as readonly string[]).join("/");
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
          return res.json();
        },
        retry: false,
      },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function dotStatus(id: number): string | null {
  return screen.getByTestId(`source-card-status-${id}`).getAttribute("data-status");
}

describe("SourcesTab — task #508 live dot updates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders initial dots derived from the server-side health snapshot", async () => {
    mockFetch({});
    renderWithClient(<SourcesTab specialistId={SPECIALIST_ID} />);
    await screen.findByTestId(`source-card-status-101`);
    expect(dotStatus(101)).toBe("red");
    expect(dotStatus(102)).toBe("gray");
  });

  it("per-card Test flips that card's dot to green on a successful probe (no reload)", async () => {
    mockFetch({
      perCard: (id) => ({
        status: "ok",
        latencyMs: 42,
        errorCode: null,
        errorMessage: null,
        checkedAt: new Date().toISOString(),
      }),
    });
    renderWithClient(<SourcesTab specialistId={SPECIALIST_ID} />);
    await screen.findByTestId("source-card-status-101");
    expect(dotStatus(101)).toBe("red");

    fireEvent.click(screen.getByTestId("button-source-test-101"));

    await waitFor(() => {
      expect(dotStatus(101)).toBe("green");
    });
    // Sibling card must NOT be touched by a per-card click.
    expect(dotStatus(102)).toBe("gray");
  });

  it("per-card Test flips a previously-healthy card to red when the probe fails", async () => {
    // Override the GET so card 102 starts green, then probe it and watch it fail.
    vi.spyOn(globalThis, "fetch" as never).mockImplementation((async (
      input: RequestInfo | URL,
    ) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith(`/api/admin/specialists/${SPECIALIST_ID}/sources`)) {
        const s = buildSources();
        s.groups[0].cards[1].health = {
          status: "green",
          lastChecked: "2026-04-25T11:00:00Z",
          lastStatus: "ok",
          lastErrorCode: null,
        };
        return new Response(JSON.stringify(s), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith(`/api/admin/resources/102/test`)) {
        return new Response(
          JSON.stringify({
            status: "fail",
            latencyMs: 9001,
            errorCode: "timeout",
            errorMessage: "Probe timed out",
            checkedAt: new Date().toISOString(),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unmocked URL: ${url}`);
    }) as never);

    renderWithClient(<SourcesTab specialistId={SPECIALIST_ID} />);
    await screen.findByTestId("source-card-status-102");
    expect(dotStatus(102)).toBe("green");

    fireEvent.click(screen.getByTestId("button-source-test-102"));

    await waitFor(() => {
      expect(dotStatus(102)).toBe("red");
    });
  });

  it("bulk Test sources refreshes EVERY card's dot in place from the per-row results", async () => {
    mockFetch({
      bulk: () => ({
        target: TARGET,
        results: [
          {
            id: 101,
            status: "ok",
            latencyMs: 42,
            errorCode: null,
            errorMessage: null,
            checkedAt: new Date().toISOString(),
          },
          {
            id: 102,
            status: "fail",
            latencyMs: 5000,
            errorCode: "5xx",
            errorMessage: "Internal error",
            checkedAt: new Date().toISOString(),
          },
        ],
      }),
    });
    renderWithClient(<SourcesTab specialistId={SPECIALIST_ID} />);
    await screen.findByTestId("source-card-status-101");
    expect(dotStatus(101)).toBe("red");
    expect(dotStatus(102)).toBe("gray");

    fireEvent.click(screen.getByTestId("button-test-all-sources"));

    await waitFor(() => {
      expect(dotStatus(101)).toBe("green");
      expect(dotStatus(102)).toBe("red");
    });
  });

  it("bulk Test preserves a card's prior dot when the server marks that row 'skipped' (rate-limited)", async () => {
    mockFetch({
      bulk: () => ({
        target: TARGET,
        results: [
          {
            id: 101,
            status: "skipped",
            errorCode: "rate_limited",
            checkedAt: new Date().toISOString(),
          },
          {
            id: 102,
            status: "ok",
            latencyMs: 30,
            errorCode: null,
            checkedAt: new Date().toISOString(),
          },
        ],
      }),
    });
    renderWithClient(<SourcesTab specialistId={SPECIALIST_ID} />);
    await screen.findByTestId("source-card-status-101");
    expect(dotStatus(101)).toBe("red"); // baseline
    expect(dotStatus(102)).toBe("gray"); // baseline

    fireEvent.click(screen.getByTestId("button-test-all-sources"));

    await waitFor(() => {
      // 101 was 'skipped' → server preserves the prior color (still red).
      expect(dotStatus(101)).toBe("red");
      // 102 went from gray → ok → green.
      expect(dotStatus(102)).toBe("green");
    });
  });

  it("bulk Test preserves the LIVE dot (not the stale server snapshot) when a row is 'skipped' after a per-card flip", async () => {
    // Regression: priorDots was being snapshotted from c.health.status (server)
    // and ignored any local override from a recent per-card test. So a card
    // that was just turned green by per-card Test could silently revert to its
    // old red server color when the next bulk run skipped it.
    mockFetch({
      perCard: (id) => ({
        status: "ok",
        latencyMs: 30,
        errorCode: null,
        errorMessage: null,
        checkedAt: new Date().toISOString(),
      }),
      bulk: () => ({
        target: TARGET,
        results: [
          {
            id: 101,
            status: "skipped",
            errorCode: "rate_limited",
            checkedAt: new Date().toISOString(),
          },
        ],
      }),
    });
    renderWithClient(<SourcesTab specialistId={SPECIALIST_ID} />);
    await screen.findByTestId("source-card-status-101");
    expect(dotStatus(101)).toBe("red"); // server baseline

    // Per-card Test on 101 → dot flips to green via local override.
    fireEvent.click(screen.getByTestId("button-source-test-101"));
    await waitFor(() => expect(dotStatus(101)).toBe("green"));

    // Bulk Test → server returns 'skipped' for 101. The dot must stay green,
    // not revert to the stale red server snapshot.
    fireEvent.click(screen.getByTestId("button-test-all-sources"));
    // Wait long enough for the bulk POST to settle and onSuccess to write
    // through. Without that delay an assertion on dot colour would race the
    // mutation and pass even when the colour later reverts. With the
    // priorDots fix in place, the dot must STAY green through the skipped
    // result; without the fix, it would silently revert to red here.
    await new Promise((r) => setTimeout(r, 150));
    expect(dotStatus(101)).toBe("green");
  });
});
