// @vitest-environment happy-dom
/**
 * Non-admin viewer guard for the property photo album.
 *
 * Task #422 introduced admin-only affordances on `PhotoAlbumGrid`
 * (upload, generate, AI enhance, multi-select, move-between-properties,
 * bulk delete). The companion task #429 requires a regression test that
 * a non-admin viewer never sees any of those controls.
 *
 * The live dev server cannot demote the seeded super_admin without
 * restarting with `DEV_SKIP_AUTH=false`, so this guard runs as a
 * happy-dom render with `@/lib/auth` mocked to return a regular
 * `user` role. We assert that the rendered DOM contains:
 *
 *   - ZERO admin-only buttons (`button-upload-photo`, `button-empty-upload`,
 *     `button-generate-photo`, `button-empty-generate`, `button-bulk-move`,
 *     `button-bulk-delete`, `button-confirm-bulk-delete`,
 *     `button-confirm-move`, `button-select-all`, any `button-enhance-*`).
 *   - NO bulk toolbar (`bulk-toolbar`).
 *   - NO selection checkboxes (any testid starting with `checkbox-photo-`).
 *
 * The companion admin-side flow lives in
 * `tests/browser/photo-album.plan.md` (Playwright via `runTest()`) and
 * `tests/e2e/photo-album-flow.test.ts` (vitest API e2e).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../../client/src/components/ui/tooltip";
import { PhotoAlbumGrid } from "../../client/src/features/property-images/PhotoAlbumGrid";

// --- Auth mock: viewer with role=user, isAdmin=false ---
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: 99, role: "user", email: "viewer@example.com" },
    isAdmin: false,
    isSuperAdmin: false,
    isChecker: false,
    isUser: true,
    isInvestor: false,
    hasManagementAccess: false,
    canManageScenarios: false,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const TEST_PROPERTY_ID = 12345;
const PHOTO_FIXTURE = [
  {
    id: 9001,
    propertyId: TEST_PROPERTY_ID,
    imageUrl: "https://placehold.co/640x480.png",
    caption: "Hero shot",
    sortOrder: 0,
    isHero: true,
    variants: null,
    generationStyle: null,
    beforePhotoId: null,
    imageData: null,
    enhancedImageData: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 9002,
    propertyId: TEST_PROPERTY_ID,
    imageUrl: "https://placehold.co/640x481.png",
    caption: "Lobby",
    sortOrder: 1,
    isHero: false,
    variants: null,
    generationStyle: null,
    beforePhotoId: null,
    imageData: null,
    enhancedImageData: null,
    createdAt: new Date().toISOString(),
  },
];

function buildFetchMock() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === `/api/properties/${TEST_PROPERTY_ID}/photos`) {
      return new Response(JSON.stringify(PHOTO_FIXTURE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "/api/properties") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

function renderAlbum() {
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
        React.createElement(PhotoAlbumGrid, {
          propertyId: TEST_PROPERTY_ID,
          propertyName: "Viewer Test Property",
          location: "Test City, TX",
        }),
      ),
    ),
  );
}

beforeEach(() => {
  globalThis.fetch = buildFetchMock() as unknown as typeof fetch;
  // happy-dom + Radix compatibility shims (mirrors the existing
  // read-only-band browser tests).
  Element.prototype.scrollIntoView = vi.fn();
  if (!(Element.prototype as unknown as { hasPointerCapture?: unknown }).hasPointerCapture) {
    (Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ADMIN_ONLY_TESTIDS = [
  "button-upload-photo",
  "button-empty-upload",
  "button-generate-photo",
  "button-empty-generate",
  "bulk-toolbar",
  "button-select-all",
  "button-bulk-move",
  "button-bulk-delete",
  "button-confirm-bulk-delete",
  "button-confirm-move",
  "dialog-bulk-delete",
  "dialog-move-photos",
];

const ADMIN_ONLY_TESTID_PREFIXES = [
  "checkbox-photo-",
  "button-enhance-",
];

describe("PhotoAlbumGrid — non-admin viewer never sees admin controls", () => {
  it("renders the album with photos but ZERO admin affordances", async () => {
    const { container } = renderAlbum();

    // Wait until photos have loaded — the empty-state branch also
    // renders an admin-gated CTA, so we want to assert the loaded grid
    // path explicitly.
    await waitFor(() => {
      expect(container.querySelector('[data-testid="photo-card-9001"]')).toBeTruthy();
    });

    const offenders: string[] = [];
    for (const testid of ADMIN_ONLY_TESTIDS) {
      const node = container.querySelector(`[data-testid="${testid}"]`);
      if (node) offenders.push(testid);
    }
    for (const prefix of ADMIN_ONLY_TESTID_PREFIXES) {
      const matches = container.querySelectorAll(`[data-testid^="${prefix}"]`);
      if (matches.length > 0) {
        offenders.push(
          `${prefix}* (${matches.length} match${matches.length === 1 ? "" : "es"})`,
        );
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        [
          "Non-admin viewer guard broken on PhotoAlbumGrid.",
          "The following admin-only data-testid(s) were rendered for a",
          "user with role=user / isAdmin=false:",
          ...offenders.map((o) => `  • ${o}`),
          "",
          "See client/src/features/property-images/PhotoAlbumGrid.tsx:",
          "every upload/enhance/move/delete affordance must live behind an",
          "`isAdmin` check, and PhotoCard must receive `readOnly={!isAdmin}`.",
        ].join("\n"),
      );
    }
    expect(offenders).toEqual([]);
  });

  it("renders an empty-state hint that does NOT include admin CTAs", async () => {
    // Re-mock fetch to return 0 photos so we hit the empty-state branch.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === `/api/properties/${TEST_PROPERTY_ID}/photos`) {
        return new Response("[]", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;

    const { container } = renderAlbum();

    // Wait for the empty-state copy.
    await waitFor(() => {
      expect(container.textContent ?? "").toContain("No photos yet");
    });

    // The empty-state CTAs are admin-only — they must not render.
    expect(container.querySelector('[data-testid="button-empty-upload"]')).toBeNull();
    expect(container.querySelector('[data-testid="button-empty-generate"]')).toBeNull();

    // The viewer-facing copy should be present.
    expect(container.textContent ?? "").toMatch(/administrator hasn't added/i);
  });
});
