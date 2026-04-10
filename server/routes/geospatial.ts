import type { Express } from "express";
import { requireAuth, requireManagementAccess, isApiRateLimited, getAuthUser, checkPropertyAccess } from "../auth";
import { geocodeSchema, logAndSendError } from "./helpers";
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
      const propertyId = Number(req.params.id);
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

      const radius = parseFloat(req.query.radius as string) || 10;

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
      if (!apiKey) {
        return res.status(503).json({ error: "Maps API not configured" });
      }

      const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&maptype=satellite&markers=color:red|${lat},${lng}&key=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: "Failed to fetch static map" });
      }

      const contentType = response.headers.get("content-type") || "image/png";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    } catch (error: unknown) {
      logAndSendError(res, "Static map failed", error);
    }
  });

  app.get("/api/geospatial/status", requireAuth, async (_req, res) => {
    res.json(getGeospatialStatus());
  });
}
