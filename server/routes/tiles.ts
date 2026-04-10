import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { logger } from "../logger";

export function register(app: Express) {
  app.get("/api/tiles/osm/:z/:x/:y", requireAuth, async (req: Request, res: Response) => {
    const { z, x, y } = req.params;
    try {
      const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "HBG-Portfolio-Map/1.0" },
      });
      if (!resp.ok) {
        return res.status(resp.status).send("Tile not found");
      }
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=86400");
      const buf = Buffer.from(await resp.arrayBuffer());
      res.send(buf);
    } catch (err: unknown) {
      logger.warn(`OSM tile fetch error ${z}/${x}/${y}: ${err instanceof Error ? err.message : err}`, "tiles");
      res.status(502).send("Tile fetch error");
    }
  });

  app.get("/api/tiles/satellite/:z/:x/:y", requireAuth, async (req: Request, res: Response) => {
    const { z, x, y } = req.params;
    try {
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "HBG-Portfolio-Map/1.0" },
      });
      if (!resp.ok) {
        return res.status(resp.status).send("Tile not found");
      }
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400");
      const buf = Buffer.from(await resp.arrayBuffer());
      res.send(buf);
    } catch (err: unknown) {
      logger.warn(`Satellite tile fetch error ${z}/${x}/${y}: ${err instanceof Error ? err.message : err}`, "tiles");
      res.status(502).send("Tile fetch error");
    }
  });

  app.get("/api/tiles/terrain/:z/:x/:y", requireAuth, async (req: Request, res: Response) => {
    const { z, x, y } = req.params;
    try {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
      const resp = await fetch(url);
      if (!resp.ok) {
        return res.status(resp.status).send("Tile not found");
      }
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=86400");
      const buf = Buffer.from(await resp.arrayBuffer());
      res.send(buf);
    } catch (err: unknown) {
      logger.warn(`Terrain tile fetch error ${z}/${x}/${y}: ${err instanceof Error ? err.message : err}`, "tiles");
      res.status(502).send("Tile fetch error");
    }
  });
}
