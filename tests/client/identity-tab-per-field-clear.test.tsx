// @vitest-environment happy-dom
/**
 * Task #464 — IdentityTab per-field "Use factory default".
 *
 * Locks the contract that admins can clear *just one* identity slot
 * (persona name OR pronoun gender) without disturbing the other:
 *   (a) Form opens with "Use factory default" pre-checked for any slot
 *       whose resolved source is the catalog (i.e. no per-field override).
 *   (b) Toggling "Use factory default" disables that input, leaves the
 *       other input editable, and marks the form dirty.
 *   (c) Saving sends `null` only for the cleared slot; the other slot
 *       sends its current override value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IdentityTab } from "../../client/src/pages/admin/specialist/tabs/IdentityTab";

const SPECIALIST_ID = "constants.tax-research";
const IDENTITY_URL = `/api/admin/specialists/${SPECIALIST_ID}/identity`;

function makeIdentityResponse(opts: {
  overrideHumanName: string | null;
  overrideGender: "male" | "female" | "neutral" | null;
}) {
  const catalog = { humanName: "Helena", gender: "female" as const };
  const hasAnyOverride = opts.overrideHumanName !== null || opts.overrideGender !== null;
  return {
    specialistId: SPECIALIST_ID,
    catalog,
    override: hasAnyOverride
      ? {
          humanName: opts.overrideHumanName,
          gender: opts.overrideGender,
          updatedByUserId: 99,
          updatedAt: "2026-04-24T00:00:00Z",
        }
      : null,
    resolved: {
      humanName: opts.overrideHumanName ?? catalog.humanName,
      gender: opts.overrideGender ?? catalog.gender,
      source: {
        humanName: (opts.overrideHumanName !== null ? "override" : "catalog") as
          | "override"
          | "catalog",
        gender: (opts.overrideGender !== null ? "override" : "catalog") as
          | "override"
          | "catalog",
      },
    },
  };
}

let putBodies: unknown[] = [];

function mockFetch(initial: ReturnType<typeof makeIdentityResponse>) {
  vi.spyOn(globalThis, "fetch" as never).mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.endsWith(IDENTITY_URL) && method === "GET") {
      return new Response(JSON.stringify(initial), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith(IDENTITY_URL) && method === "PUT") {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      putBodies.push(body);
      // Echo back a plausible response so the mutation onSuccess path runs.
      const updated = makeIdentityResponse({
        overrideHumanName: body?.humanName ?? null,
        overrideGender: body?.gender ?? null,
      });
      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unmocked ${method} ${url}`);
  }) as never);
}

function renderTab() {
  // Mirror the project's default queryFn (queryKey joined with `/`) so the
  // IdentityTab's `useQuery` actually fires a fetch against our mock.
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const url = queryKey.join("/") as string;
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
          return res.json();
        },
      },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <IdentityTab specialistId={SPECIALIST_ID} />
    </QueryClientProvider>,
  );
}

describe("IdentityTab per-field 'Use factory default' clearing", () => {
  beforeEach(() => {
    putBodies = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("seeds 'Use factory default' from the resolved source map", async () => {
    // Override has gender but humanName is null → name slot uses catalog.
    mockFetch(makeIdentityResponse({ overrideHumanName: null, overrideGender: "neutral" }));
    renderTab();
    const nameDefault = (await screen.findByTestId(
      "checkbox-identity-name-default",
    )) as HTMLButtonElement;
    const genderDefault = (await screen.findByTestId(
      "checkbox-identity-gender-default",
    )) as HTMLButtonElement;
    // Radix Checkbox surfaces state via aria-checked / data-state.
    expect(nameDefault.getAttribute("data-state")).toBe("checked");
    expect(genderDefault.getAttribute("data-state")).toBe("unchecked");
  });

  it("clears only persona name (sends humanName: null, keeps gender override)", async () => {
    // Both slots overridden — admin then clears name only.
    mockFetch(makeIdentityResponse({ overrideHumanName: "Hellena", overrideGender: "neutral" }));
    renderTab();

    const nameInput = (await screen.findByTestId(
      "input-identity-human-name",
    )) as HTMLInputElement;
    expect(nameInput.value).toBe("Hellena");
    expect(nameInput.disabled).toBe(false);

    const nameDefault = await screen.findByTestId("checkbox-identity-name-default");
    fireEvent.click(nameDefault);

    // Toggling default disables the input but leaves it visible.
    await waitFor(() => {
      const after = screen.getByTestId("input-identity-human-name") as HTMLInputElement;
      expect(after.disabled).toBe(true);
    });

    // Save should now be enabled (form is dirty).
    const saveBtn = screen.getByTestId("button-identity-save") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(putBodies.length).toBe(1);
    });
    expect(putBodies[0]).toMatchObject({ humanName: null, gender: "neutral" });
  });

  it("clears only gender (sends gender: null, keeps humanName override)", async () => {
    mockFetch(makeIdentityResponse({ overrideHumanName: "Hellena", overrideGender: "neutral" }));
    renderTab();

    await screen.findByTestId("input-identity-human-name");
    const genderDefault = await screen.findByTestId("checkbox-identity-gender-default");
    fireEvent.click(genderDefault);

    const saveBtn = screen.getByTestId("button-identity-save") as HTMLButtonElement;
    await waitFor(() => expect(saveBtn.disabled).toBe(false));

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(putBodies.length).toBe(1);
    });
    expect(putBodies[0]).toMatchObject({ humanName: "Hellena", gender: null });
  });
});
