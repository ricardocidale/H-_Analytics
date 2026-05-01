import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { COUNTRY_DEFAULTS, US_STATE_DEFAULTS, getCountryDefaults, getUsStateDefaults } from "../../shared/countryDefaults";

export function register(app: Express) {
  app.get("/api/country-defaults", requireAuth, (_req: Request, res: Response) => {
    res.json(COUNTRY_DEFAULTS);
  });

  app.get("/api/country-defaults/us-states", requireAuth, (_req: Request, res: Response) => {
    res.json(US_STATE_DEFAULTS);
  });

  app.get("/api/country-defaults/:country", requireAuth, (req: Request, res: Response) => {
    const country = decodeURIComponent(String(req.params.country));
    const defaults = getCountryDefaults(country);
    if (!defaults) {
      return res.status(404).json({ error: `No defaults found for: ${country}` });
    }
    return res.json({ country, ...defaults });
  });

  app.get("/api/country-defaults/us-states/:state", requireAuth, (req: Request, res: Response) => {
    const state = decodeURIComponent(String(req.params.state));
    const defaults = getUsStateDefaults(state);
    if (!defaults) {
      return res.status(404).json({ error: `No defaults found for US state: ${state}` });
    }
    return res.json({ state, ...defaults });
  });
}
