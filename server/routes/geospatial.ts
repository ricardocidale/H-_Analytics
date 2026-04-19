import type { Express } from "express";
import { requireAuth, requireManagementAccess, isApiRateLimited, getAuthUser, checkPropertyAccess } from "../auth";
import { geocodeSchema, logAndSendError, parseRouteId } from "./helpers";
import { fromZodError } from "zod-validation-error";
import {
  geocodeAddress,
  placesAutocomplete,
  placeDetails,
  nearbyPOISearch,
  geocodeAndUpdateProperty,
  getGeospatialStatus,
  type POIType,
} from "../integrations/geospatial";

export function register(app: Express) {
  app.post("/api/geocode", requireAuth, async (req, res) => {
    try {
      if (isApiRateLimited(getAuthUser(req).id, "geocode", 20)) {
        return res.status(429).json({ error: "Rate limit exceeded. Please wait before geocoding again." });
      }
      const validation = geocodeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const coords = await geocodeAddress(validation.data.address);
      if (!coords) {
        return res.status(404).json({ error: "Could not geocode address" });
      }

      res.json(coords);
    } catch (error: unknown) {
      logAndSendError(res, "Geocoding failed", error);
    }
  });

  app.post("/api/geocode/property/:id", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const coords = await geocodeAndUpdateProperty(propertyId);
      if (!coords) {
        return res.status(404).json({ error: "Could not geocode property address" });
      }
      res.json(coords);
    } catch (error: unknown) {
      logAndSendError(res, "Property geocoding failed", error);
    }
  });

  app.get("/api/places/autocomplete", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q || "");
      if (!q || q.length < 2) {
        return res.json([]);
      }

      const countryBias = req.query.country ? String(req.query.country).toLowerCase() : undefined;
      const stateBias = req.query.state ? String(req.query.state) : undefined;
      const suggestions = await placesAutocomplete(q, countryBias, stateBias);
      res.json(suggestions);
    } catch (error: unknown) {
      logAndSendError(res, "Autocomplete failed", error);
    }
  });

  app.get("/api/places/details/:placeId", requireAuth, async (req, res) => {
    try {
      const details = await placeDetails(String(req.params.placeId));
      if (!details) {
        return res.status(404).json({ error: "Place not found" });
      }
      res.json(details);
    } catch (error: unknown) {
      logAndSendError(res, "Place details failed", error);
    }
  });

  app.get("/api/places/nearby", requireAuth, async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);

      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: "Valid lat and lng are required" });
      }

      const typesParam = req.query.types as string | undefined;
      const types = typesParam
        ? (typesParam.split(",") as POIType[])
        : ["hotel", "airport", "convention_center", "tourist_attraction"] as POIType[];

      const radius = Math.min(parseFloat(req.query.radius as string) || 10, 100);

      const pois = await nearbyPOISearch(lat, lng, types, radius);
      res.json(pois);
    } catch (error: unknown) {
      logAndSendError(res, "Nearby search failed", error);
    }
  });

  app.get("/api/geospatial/static-map", requireAuth, async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const zoom = parseInt(req.query.zoom as string) || 15;
      const width = Math.min(parseInt(req.query.w as string) || 600, 640);
      const height = Math.min(parseInt(req.query.h as string) || 300, 640);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "Valid lat and lng are required" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (apiKey) {
        const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&maptype=satellite&markers=color:red|${lat},${lng}&key=${apiKey}`;
        const response = await fetch(url);
        if (response.ok) {
          const contentType = response.headers.get("content-type") || "image/png";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=86400");
          const buffer = Buffer.from(await response.arrayBuffer());
          return res.send(buffer);
        }
      }

      const sharp = (await import("sharp")).default;
      const tileSize = 256;

      // eslint-disable-next-line no-restricted-syntax -- tile zoom math, non-financial
      const n = Math.pow(2, zoom);
      const centerTileX = ((lng + 180) / 360) * n;
      const latRad = (lat * Math.PI) / 180;
      const centerTileY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

      const centerTileXInt = Math.floor(centerTileX);
      const centerTileYInt = Math.floor(centerTileY);
      const offsetX = Math.round((centerTileX - centerTileXInt) * tileSize);
      const offsetY = Math.round((centerTileY - centerTileYInt) * tileSize);

      const halfTilesX = Math.ceil(width / 2 / tileSize) + 1;
      const halfTilesY = Math.ceil(height / 2 / tileSize) + 1;
      const gridW = halfTilesX * 2 + 1;
      const gridH = halfTilesY * 2 + 1;
      const canvasW = gridW * tileSize;
      const canvasH = gridH * tileSize;

      const composites: Array<{ input: Buffer; left: number; top: number }> = [];

      const tilePromises: Array<Promise<void>> = [];
      for (let dy = -halfTilesY; dy <= halfTilesY; dy++) {
        for (let dx = -halfTilesX; dx <= halfTilesX; dx++) {
          const tx = ((centerTileXInt + dx) % n + n) % n;
          const ty = centerTileYInt + dy;
          if (ty < 0 || ty >= n) continue;

          const left = (dx + halfTilesX) * tileSize;
          const top = (dy + halfTilesY) * tileSize;

          tilePromises.push(
            fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`, {
              headers: { "User-Agent": "HBG-Portfolio-Map/1.0" },
              signal: AbortSignal.timeout(10_000),
            })
              .then(async (r) => {
                if (r.ok) {
                  composites.push({ input: Buffer.from(await r.arrayBuffer()), left, top });
                }
              })
              .catch(() => { /* tile fetch failed silently — dark area on map */ })
          );
        }
      }

      await Promise.all(tilePromises);

      if (composites.length === 0) {
        return res.status(502).json({ error: "Failed to fetch satellite tiles" });
      }

      const cropLeft = halfTilesX * tileSize + offsetX - Math.floor(width / 2);
      const cropTop = halfTilesY * tileSize + offsetY - Math.floor(height / 2);

      const markerSize = 12;
      const markerX = Math.floor(width / 2) - markerSize;
      const markerY = Math.floor(height / 2) - markerSize * 2;
      const markerSvg = Buffer.from(`<svg width="${markerSize * 2}" height="${markerSize * 3}">
        <circle cx="${markerSize}" cy="${markerSize}" r="${markerSize - 1}" fill="#e53e3e" stroke="white" stroke-width="2"/>
        <circle cx="${markerSize}" cy="${markerSize}" r="4" fill="white"/>
      </svg>`);

      const canvasBuffer = await sharp({
        create: { width: canvasW, height: canvasH, channels: 3, background: { r: 30, g: 30, b: 40 } },
      })
        .composite(composites)
        .png()
        .toBuffer();

      const result = await sharp(canvasBuffer)
        .extract({ left: Math.max(0, cropLeft), top: Math.max(0, cropTop), width, height })
        .composite([{ input: markerSvg, left: Math.max(0, markerX), top: Math.max(0, markerY) }])
        .jpeg({ quality: 85 })
        .toBuffer();

      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(result);
    } catch (error: unknown) {
      logAndSendError(res, "Static map failed", error);
    }
  });

  app.get("/api/geospatial/status", requireAuth, async (_req, res) => {
    res.json(getGeospatialStatus());
  });
}
