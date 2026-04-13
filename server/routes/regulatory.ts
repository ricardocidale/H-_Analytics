import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import {
  getRegulatoryProfile,
  getAllRegulatoryProfiles,
} from "../../shared/regulatory-data";

export function register(app: Express) {
  /** GET /api/regulatory — returns all regulatory profiles (admin/research overview) */
  app.get("/api/regulatory", requireAuth, (_req: Request, res: Response) => {
    const profiles = getAllRegulatoryProfiles();
    res.json(profiles);
  });

  /** GET /api/regulatory/:countryCode — returns profile for a specific country */
  app.get("/api/regulatory/:countryCode", requireAuth, (req: Request, res: Response) => {
    const key = decodeURIComponent(String(req.params.countryCode));
    const profile = getRegulatoryProfile(key);
    if (!profile) {
      return res.status(404).json({
        error: `No regulatory profile found for: ${key}`,
      });
    }
    return res.json(profile);
  });
}
