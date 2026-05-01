// @vitest-environment happy-dom
/**
 * Task #564 — Resources detail dialog: per-consumer quality history charts.
 *
 * Locks the user-facing contract added by Task #552 / #555 for the
 * "Quality & Gaps" tab inside the Resource detail dialog:
 *
 *   (a) When a resource has multiple consumers, the tab renders one
 *       history row per consumer (data-testid="consumer-history-{id}"),
 *       wired to the bulk
 *       `GET /api/admin/resources/:id/quality/history?limit=30` payload.
 *   (b) When a resource has zero consumers, the tab shows the "no
 *       consumers" empty-state copy (data-testid="consumer-history-empty")
 *       and does NOT render the row list.
 *   (c) While the bulk history fetch is pending, every consumer row
 *       falls back to `consumer-history-loading-{id}`.
 *   (d) When the bulk history fetch errors out, every consumer row falls
 *       back to `consumer-history-error-{id}`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResourceDetailDialog } from "../../client/src/components/admin/resources/ResourceDetailDialog";

// Recharts' ResponsiveContainer requires ResizeObserver, which happy-dom
// does not ship by default. The chart is rendered when the success-case
// payload has 2+ history points; provide a no-op shim so it doesn't blow
// up before our assertions run.
if (!(globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
}

const RESOURCE_ID = 42;

interface ConsumerFixture {
  specialistId: string;
  specialistName: string;
  letter: string | null;
  required: boolean;
  role: string | null;
  qualityScore: number | null;
  qualityGaps: never[];
  qualityComputedAt: string | null;
}

const DEFAULT_CONSUMERS: ConsumerFixture[] = [
  {
    specialistId: "helena",
    specialistName: "Helena",
    letter: "H",
    required: true,
    role: "primary",
    qualityScore: 88,
    qualityGaps: [],
    qualityComputedAt: null,
  },
  {
    specialistId: "daniela",
    specialistName: "Daniela",
    letter: "D",
    required: false,
    role: "secondary",
    qualityScore: 70,
    qualityGaps: [],
    qualityComputedAt: null,
  },
  {
    specialistId: "leticia",
    specialistName: "Letícia",
    letter: "L",
    required: false,
    role: null,
    qualityScore: 55,
    qualityGaps: [],
    qualityComputedAt: null,
  },
];

const HISTORY_POINTS = [
  { score: 70, computedAt: "2026-04-20T00:00:00Z" },
  { score: 75, computedAt: "2026-04-21T00:00:00Z" },
  { score: 80, computedAt: "2026-04-22T00:00:00Z" },
];

function buildTransparency(consumers: ConsumerFixture[]) {
  return {
    resource: {
      id: RESOURCE_ID,
      slug: "openai-gpt-5",
      displayName: "OpenAI GPT-5",
      description: "Shared LLM model",
      kind: "llm_model",
      version: 1,
      hasSecret: true,
      config: {},
    },
    health: {
      status: "green",
      lastChecked: "2026-04-25T10:00:00Z",
      lastStatus: "ok",
      recentProbes: [],
    },
    consumers,
    quality: {
      avg: consumers.length === 0 ? null : 71,
      min: consumers.length === 0 ? null : 55,
      criticalGaps: 0,
    },
    recentCalls: [],
  };
}

interface MockOptions {
  consumers?: ConsumerFixture[];
  historyMode: "ok" | "loading" | "error";
}

function mockFetch({ consumers, historyMode }: MockOptions) {
  const cs = consumers ?? DEFAULT_CONSUMERS;
  vi.spyOn(globalThis, "fetch" as never).mockImplementation((async (
    input: RequestInfo | URL,
  ) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.endsWith(`/api/admin/resources/${RESOURCE_ID}/transparency`)) {
      return new Response(JSON.stringify(buildTransparency(cs)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes(`/api/admin/resources/${RESOURCE_ID}/quality/history`)) {
      // The dialog requests `?limit=30`; assert we keep that contract.
      if (!url.includes("limit=30")) {
        throw new Error(`Expected ?limit=30 on history URL but got ${url}`);
      }
      if (historyMode === "loading") {
        // Never resolve — leaves the query in its loading state for the
        // duration of the assertion window.
        return await new Promise<Response>(() => {
          /* intentionally never resolves */
        });
      }
      if (historyMode === "error") {
        return new Response("server boom", { status: 500 });
      }
      const histories = cs.map((c) => ({
        specialistId: c.specialistId,
        points: HISTORY_POINTS,
      }));
      // Aggregate mirrors what computeResourceAggregateTrend returns: avg+min
      // across consumers per day. All consumers share the same HISTORY_POINTS
      // in this fixture so avg === min === each point's score.
      const aggregate = {
        points: HISTORY_POINTS.map((p) => ({
          ...p,
          min: p.score,
          consumerCount: cs.length,
        })),
      };
      return new Response(
        JSON.stringify({ resourceId: RESOURCE_ID, histories, aggregate }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`Unmocked URL: ${url}`);
  }) as never);
}

function renderDialog() {
  // Mirror the production default queryFn (see client/src/lib/queryClient.ts):
  // it fetches `queryKey.join("/")` so plain `useQuery({ queryKey: [url] })`
  // works without a per-call queryFn — the transparency query in the dialog
  // relies on this behaviour.
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async ({ queryKey }) => {
          const url = (queryKey as readonly unknown[])[0] as string;
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
          return res.json();
        },
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ResourceDetailDialog
        resourceId={RESOURCE_ID}
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

async function openQualityTab() {
  // The dialog defaults to the Overview tab; flip to Quality & Gaps so
  // the per-consumer history rows mount (Radix unmounts inactive tab
  // panels by default). Radix Tabs.Trigger swaps the active value on
  // pointer/keyboard activation, so use userEvent (which fires the
  // pointer event sequence) instead of fireEvent.click — happy-dom
  // alone doesn't dispatch the events Radix listens for.
  const trigger = await screen.findByTestId("tab-quality");
  const user = userEvent.setup();
  await user.click(trigger);
}

describe("ResourceDetailDialog Quality & Gaps history charts (Task #564)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders one history chart per consumer when the resource has multiple consumers", async () => {
    mockFetch({ historyMode: "ok" });
    renderDialog();

    await openQualityTab();

    const list = await screen.findByTestId("consumer-history-list");
    // One history row per consumer, identified by a unique row testID.
    for (const id of ["helena", "daniela", "leticia"]) {
      expect(within(list).getByTestId(`consumer-history-${id}`)).toBeTruthy();
    }

    // Once the bulk history payload resolves, every row must have flipped
    // from its loading placeholder to the actual chart container — the
    // QualityHistoryChart emits `${testIdPrefix}-chart` when it has 2+
    // points, and the row passes `consumer-history-row-${specialistId}`
    // as that prefix.
    await waitFor(() => {
      for (const id of ["helena", "daniela", "leticia"]) {
        expect(
          within(list).getByTestId(`consumer-history-row-${id}-chart`),
        ).toBeTruthy();
      }
    });

    // No row may still be showing the loading or error fallback after
    // the bulk fetch resolves.
    for (const id of ["helena", "daniela", "leticia"]) {
      expect(
        within(list).queryByTestId(`consumer-history-loading-${id}`),
      ).toBeNull();
      expect(
        within(list).queryByTestId(`consumer-history-error-${id}`),
      ).toBeNull();
    }

    // The empty-state copy (used for the zero-consumers case) must NOT
    // appear when the resource actually has consumers.
    expect(screen.queryByTestId("consumer-history-empty")).toBeNull();
  });

  it("shows the no-consumers empty state when the resource has zero consumers", async () => {
    mockFetch({ consumers: [], historyMode: "ok" });
    renderDialog();

    await openQualityTab();

    const empty = await screen.findByTestId("consumer-history-empty");
    expect(empty.textContent ?? "").toMatch(
      /No Specialist consumes this resource/i,
    );
    // The list container must NOT render in the empty case — the dialog
    // collapses to the explanatory copy only.
    expect(screen.queryByTestId("consumer-history-list")).toBeNull();
  });

  it("renders the loading fallback per consumer while the bulk history endpoint is pending", async () => {
    mockFetch({ historyMode: "loading" });
    renderDialog();

    await openQualityTab();

    const list = await screen.findByTestId("consumer-history-list");
    // Every consumer row must render its loading placeholder while the
    // shared bulk history fetch is in flight.
    expect(
      within(list).getByTestId("consumer-history-loading-helena"),
    ).toBeTruthy();
    expect(
      within(list).getByTestId("consumer-history-loading-daniela"),
    ).toBeTruthy();
    expect(
      within(list).getByTestId("consumer-history-loading-leticia"),
    ).toBeTruthy();
    // Error fallback must NOT appear while the request is merely pending.
    expect(
      within(list).queryByTestId("consumer-history-error-helena"),
    ).toBeNull();
  });

  it("renders the error fallback per consumer when the bulk history endpoint fails", async () => {
    mockFetch({ historyMode: "error" });
    renderDialog();

    await openQualityTab();

    const list = await screen.findByTestId("consumer-history-list");
    await waitFor(() => {
      expect(
        within(list).getByTestId("consumer-history-error-helena"),
      ).toBeTruthy();
      expect(
        within(list).getByTestId("consumer-history-error-daniela"),
      ).toBeTruthy();
      expect(
        within(list).getByTestId("consumer-history-error-leticia"),
      ).toBeTruthy();
    });
    // Once the request has settled into the error state, the loading
    // fallback must no longer be on screen.
    expect(
      within(list).queryByTestId("consumer-history-loading-helena"),
    ).toBeNull();
  });
});
