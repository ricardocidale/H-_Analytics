/**
 * E2E Photo Album Flow — exercises the admin-managed multi-select photo
 * album APIs added in task #422 against the live server.
 *
 * Run with:  E2E=1 npx vitest run tests/e2e/photo-album-flow.test.ts
 *
 * To additionally exercise the live Replicate enhancement lifecycle:
 *            E2E=1 RUN_REPLICATE=1 npx vitest run tests/e2e/photo-album-flow.test.ts
 *
 * Covers the full backend round-trip the new PhotoAlbumGrid relies on:
 *
 *   1. Sign in as the seeded super_admin (Replit Auth dev seed).
 *   2. Create two disposable test properties (A and B) so the test
 *      never mutates real portfolio data.
 *   3. Upload a photo to Property A (skipProcessing + skipEnhancement
 *      true so we do not touch Replit Object Storage or Replicate
 *      from this deterministic CI test).
 *   4. Exercise the AI-enhance preview lifecycle by calling
 *      `/enhance/reject` directly — this proves the admin-only enhance
 *      route is wired without spending a real Replicate request. When
 *      `RUN_REPLICATE=1` is set, also drive a real enhance → preview →
 *      reject round-trip against Replicate.
 *   5. POST `/api/properties/:id/photos/move` to move the photo from
 *      Property A to Property B and verify ownership flipped.
 *   6. Upload a second photo to Property B and bulk-delete both photos
 *      on Property B (the loop matches the client-side bulk-delete
 *      handler in PhotoAlbumGrid).
 *   7. afterAll cleans up both test properties (cascade drops the
 *      photo rows).
 *
 * The executable Playwright spec at `tests/playwright/photo-album.spec.ts`
 * exercises the same admin happy path through the real UI (including
 * an opt-in enhance → accept round-trip with `RUN_REPLICATE=1`). The
 * companion `tests/browser/photo-album.plan.md` is the matching
 * `runTest()` script for ad-hoc agent-driven validation.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE = process.env.E2E_BASE_URL || "http://localhost:5000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "ricardo.cidale@norfolkgroup.io";
const ADMIN_PASSWORD = process.env.PASSWORD_ADMIN || process.env.PASSWORD_DEFAULT || "";

// 1×1 transparent PNG, base64. Lets us round-trip a real image_data
// blob through the upload pipeline without depending on Object Storage
// or any AI service.
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    redirect: "manual",
  });
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error("No Set-Cookie header on login response");
  return cookie.split(";")[0];
}

async function authedFetch(
  path: string,
  cookie: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...((init.headers as Record<string, string>) ?? {}),
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    redirect: "manual",
  });
}

function makeTestPropertyPayload(suffix: string) {
  return {
    name: `E2E Photo Album ${suffix}`,
    location: "Test Location",
    streetAddress: "123 Test St",
    city: "Test City",
    stateProvince: "TX",
    zipPostalCode: "00000",
    country: "United States",
    market: "North America",
    imageUrl: "https://placehold.co/300",
    status: "Planned",
    acquisitionDate: "2027-01-01",
    operationsStartDate: "2027-06-01",
    purchasePrice: 1_000_000,
    buildingImprovements: 100_000,
    preOpeningCosts: 50_000,
    operatingReserve: 50_000,
    roomCount: 5,
    startAdr: 200,
    adrGrowthRate: 0.03,
    startOccupancy: 0.5,
    maxOccupancy: 0.7,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,
    type: "Hotel",
  };
}

describe.skipIf(!process.env.E2E)("E2E Photo Album Flow", () => {
  let sessionCookie: string;
  let propertyAId: number | null = null;
  let propertyBId: number | null = null;
  let firstPhotoId: number | null = null;
  let secondPhotoId: number | null = null;
  // Random suffix keeps test names unique even if a previous run
  // crashed before afterAll cleanup ran.
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    sessionCookie = await login();

    const aRes = await authedFetch("/api/properties", sessionCookie, {
      method: "POST",
      body: JSON.stringify(makeTestPropertyPayload(`A-${suffix}`)),
    });
    expect(aRes.status).toBe(201);
    propertyAId = (await aRes.json()).id;

    const bRes = await authedFetch("/api/properties", sessionCookie, {
      method: "POST",
      body: JSON.stringify(makeTestPropertyPayload(`B-${suffix}`)),
    });
    expect(bRes.status).toBe(201);
    propertyBId = (await bRes.json()).id;
  });

  afterAll(async () => {
    if (!sessionCookie) return;
    for (const id of [propertyAId, propertyBId]) {
      if (id != null) {
        await authedFetch(`/api/properties/${id}`, sessionCookie, {
          method: "DELETE",
        }).catch(() => {});
      }
    }
  });

  // ── Step 1: Upload a photo to Property A ─────────────────────────
  it("uploads a photo to Property A", async () => {
    expect(propertyAId).not.toBeNull();
    const res = await authedFetch(
      `/api/properties/${propertyAId}/photos`,
      sessionCookie,
      {
        method: "POST",
        body: JSON.stringify({
          imageUrl: `data:image/png;base64,${TINY_PNG_B64}`,
          imageData: TINY_PNG_B64,
          caption: `E2E hero photo ${suffix}`,
          isHero: true,
          // Skip background work — we are testing CRUD + move, not
          // Object Storage / Replicate.
          skipProcessing: true,
          skipEnhancement: true,
        }),
      },
    );
    expect(res.status).toBe(201);
    const photo = await res.json();
    expect(photo.id).toBeDefined();
    expect(photo.propertyId).toBe(propertyAId);
    expect(photo.caption).toContain(suffix);
    firstPhotoId = photo.id;
  });

  // ── Step 2: List confirms photo lives on Property A ──────────────
  it("GET /api/properties/A/photos lists the new photo", async () => {
    const res = await authedFetch(
      `/api/properties/${propertyAId}/photos`,
      sessionCookie,
    );
    expect(res.status).toBe(200);
    const photos = await res.json();
    expect(Array.isArray(photos)).toBe(true);
    expect(photos.find((p: { id: number }) => p.id === firstPhotoId)).toBeDefined();
  });

  // ── Step 3a: Enhance lifecycle — reject a (non-existent) preview ─
  // Calling /enhance/reject without a pending preview must succeed
  // and return { success: true } (idempotent cleanup). This proves
  // the admin-only enhance routes are wired without spending a real
  // Replicate API call from the deterministic CI test.
  it("POST /enhance/reject succeeds even when no preview is pending", async () => {
    expect(firstPhotoId).not.toBeNull();
    const res = await authedFetch(
      `/api/property-photos/${firstPhotoId}/enhance/reject`,
      sessionCookie,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // ── Step 3b: Optional live Replicate enhance round-trip ──────────
  // Opt-in only: gated by RUN_REPLICATE=1 because the call uses real
  // Replicate quota (rate-limited 3/min/user). When run, it drives
  // the full enhance → preview → reject lifecycle and asserts the
  // photo row carries an `enhancedImageData` blob (the preview) that
  // is then cleared by reject.
  it.skipIf(!process.env.RUN_REPLICATE)(
    "POST /enhance writes a preview, /enhance/reject clears it",
    async () => {
      expect(firstPhotoId).not.toBeNull();
      const enhRes = await authedFetch(
        `/api/property-photos/${firstPhotoId}/enhance`,
        sessionCookie,
        { method: "POST" },
      );
      expect(enhRes.status, await enhRes.text().catch(() => "")).toBe(200);
      const enhBody = await enhRes.json();
      expect(enhBody.enhancedImageUrl ?? enhBody.enhancedImageData).toBeTruthy();

      const rejRes = await authedFetch(
        `/api/property-photos/${firstPhotoId}/enhance/reject`,
        sessionCookie,
        { method: "POST" },
      );
      expect(rejRes.status).toBe(200);
      expect((await rejRes.json()).success).toBe(true);
    },
    180_000,
  );

  // ── Step 4: Move the photo from Property A to Property B ─────────
  it("POST /photos/move transfers the photo from A to B", async () => {
    expect(firstPhotoId).not.toBeNull();
    expect(propertyBId).not.toBeNull();

    const res = await authedFetch(
      `/api/properties/${propertyAId}/photos/move`,
      sessionCookie,
      {
        method: "POST",
        body: JSON.stringify({
          photoIds: [firstPhotoId],
          destinationPropertyId: propertyBId,
          mode: "move",
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.mode).toBe("move");
    expect(body.count).toBe(1);

    // Source property no longer has the photo.
    const aRes = await authedFetch(
      `/api/properties/${propertyAId}/photos`,
      sessionCookie,
    );
    const aPhotos = await aRes.json();
    expect(aPhotos.find((p: { id: number }) => p.id === firstPhotoId)).toBeUndefined();

    // Destination property has it.
    const bRes = await authedFetch(
      `/api/properties/${propertyBId}/photos`,
      sessionCookie,
    );
    const bPhotos = await bRes.json();
    expect(bPhotos.find((p: { id: number }) => p.id === firstPhotoId)).toBeDefined();
  });

  // ── Step 5: Move with destination = source is rejected ───────────
  it("POST /photos/move rejects same source/destination", async () => {
    const res = await authedFetch(
      `/api/properties/${propertyBId}/photos/move`,
      sessionCookie,
      {
        method: "POST",
        body: JSON.stringify({
          photoIds: [firstPhotoId],
          destinationPropertyId: propertyBId,
          mode: "move",
        }),
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/different/i);
  });

  // ── Step 6: Upload a 2nd photo to Property B for bulk-delete ─────
  it("uploads a second photo to Property B", async () => {
    const res = await authedFetch(
      `/api/properties/${propertyBId}/photos`,
      sessionCookie,
      {
        method: "POST",
        body: JSON.stringify({
          imageUrl: `data:image/png;base64,${TINY_PNG_B64}`,
          imageData: TINY_PNG_B64,
          caption: `E2E second photo ${suffix}`,
          skipProcessing: true,
          skipEnhancement: true,
        }),
      },
    );
    expect(res.status).toBe(201);
    const photo = await res.json();
    expect(photo.propertyId).toBe(propertyBId);
    secondPhotoId = photo.id;
  });

  // ── Step 7: Bulk-delete both photos from Property B ──────────────
  // Mirrors the client-side handleBulkDelete loop in PhotoAlbumGrid.tsx.
  it("bulk-deletes the selected photos from Property B", async () => {
    const ids = [firstPhotoId, secondPhotoId].filter(
      (x): x is number => x != null,
    );
    expect(ids.length).toBe(2);

    let ok = 0;
    for (const id of ids) {
      const res = await authedFetch(
        `/api/properties/${propertyBId}/photos/${id}`,
        sessionCookie,
        { method: "DELETE" },
      );
      expect(res.status).toBe(204);
      ok++;
    }
    expect(ok).toBe(2);

    const after = await authedFetch(
      `/api/properties/${propertyBId}/photos`,
      sessionCookie,
    );
    const remaining = await after.json();
    for (const id of ids) {
      expect(remaining.find((p: { id: number }) => p.id === id)).toBeUndefined();
    }
  });
});
