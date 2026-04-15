import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Property Photos API Routes — Static Analysis Tests
 *
 * Verifies route structure, auth guards, validation, and storage delegation
 * by reading the source file and checking for required patterns.
 */

const routesSrc = fs.readFileSync(
  path.resolve(__dirname, "../../server/routes/property-photos.ts"),
  "utf-8"
);

const scenariosSrc = fs.readFileSync(
  path.resolve(__dirname, "../../server/routes/scenarios.ts"),
  "utf-8"
) + fs.readFileSync(
  path.resolve(__dirname, "../../server/routes/scenario-helpers.ts"),
  "utf-8"
);

describe("Property Photos Routes — endpoint structure", () => {
  it("registers GET /api/properties/:id/photos (list)", () => {
    expect(routesSrc).toContain('app.get("/api/properties/:id/photos"');
  });

  it("registers POST /api/properties/:id/photos (add)", () => {
    expect(routesSrc).toContain('app.post("/api/properties/:id/photos"');
  });

  it("registers PATCH /api/properties/:id/photos/:photoId (update)", () => {
    expect(routesSrc).toContain('app.patch("/api/properties/:id/photos/:photoId"');
  });

  it("registers DELETE /api/properties/:id/photos/:photoId (delete)", () => {
    expect(routesSrc).toContain('app.delete("/api/properties/:id/photos/:photoId"');
  });

  it("registers POST set-hero endpoint", () => {
    expect(routesSrc).toContain("/set-hero");
  });

  it("registers PUT reorder endpoint", () => {
    expect(routesSrc).toContain('app.put("/api/properties/:id/photos/reorder"');
  });
});

describe("Property Photos Routes — auth guard", () => {
  it("all endpoints require authentication or management access", () => {
    const authMatches = routesSrc.match(/requireAuth|requireManagementAccess/g);
    expect(authMatches).not.toBeNull();
    expect(authMatches!.length).toBeGreaterThanOrEqual(7);
  });

  it("write endpoints require management access (IDOR protection)", () => {
    const mgmtMatches = routesSrc.match(/requireManagementAccess/g);
    expect(mgmtMatches).not.toBeNull();
    expect(mgmtMatches!.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Property Photos Routes — validation", () => {
  it("POST validates with insertPropertyPhotoSchema", () => {
    expect(routesSrc).toContain("insertPropertyPhotoSchema.safeParse");
  });

  it("PATCH validates with updatePropertyPhotoSchema", () => {
    expect(routesSrc).toContain("updatePropertyPhotoSchema.safeParse");
  });

  it("reorder validates orderedIds array", () => {
    expect(routesSrc).toContain("z.array(z.number())");
  });

  it("POST denies access for invalid property", () => {
    // checkPropertyAccess returns 403 for both non-existent and unauthorized — no info leakage
    expect(routesSrc).toContain('res.status(403).json({ error: "Access denied" })');
  });

  it("PATCH returns 404 for non-existent photo", () => {
    expect(routesSrc).toContain('res.status(404).json({ error: "Photo not found" })');
  });
});

describe("Property Photos Routes — storage delegation", () => {
  it("GET delegates to storage.getPropertyPhotos", () => {
    expect(routesSrc).toContain("storage.getPropertyPhotos(propertyId)");
  });

  it("POST delegates to storage.addPropertyPhoto", () => {
    expect(routesSrc).toContain("storage.addPropertyPhoto(parsed.data)");
  });

  it("PATCH delegates to storage.updatePropertyPhoto", () => {
    expect(routesSrc).toContain("storage.updatePropertyPhoto(photoId, parsed.data)");
  });

  it("DELETE delegates to storage.deletePropertyPhoto", () => {
    expect(routesSrc).toContain("storage.deletePropertyPhoto(photoId)");
  });

  it("set-hero delegates to storage.setHeroPhoto", () => {
    expect(routesSrc).toContain("storage.setHeroPhoto(propertyId, photoId)");
  });

  it("reorder delegates to storage.reorderPhotos", () => {
    expect(routesSrc).toContain("storage.reorderPhotos(propertyId, parsed.data.orderedIds)");
  });
});

describe("Scenario Routes — photo snapshot compatibility", () => {
  it("scenario snapshots decouple photos from scenarios", () => {
    const helpersSrc = fs.readFileSync(path.resolve(__dirname, "../../server/routes/scenario-helpers.ts"), "utf-8");
    expect(helpersSrc).toContain("propertyPhotos");
    expect(helpersSrc).not.toMatch(/getPhotosByProperties/);
  });

  it("scenario load passes propertyPhotos to loadScenario", () => {
    expect(scenariosSrc).toContain("propertyPhotos");
    expect(scenariosSrc).toContain("loadScenario");
  });
});
