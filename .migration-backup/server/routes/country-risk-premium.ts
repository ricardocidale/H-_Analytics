import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { lookupCountryRiskPremium, getAllCountryRiskPremiums } from "../../shared/countryRiskPremiums";

export function register(app: Express) {
  app.get("/api/country-risk-premiums", requireAuth, (_req: Request, res: Response) => {
    res.json(getAllCountryRiskPremiums());
  });

  app.get("/api/country-risk-premium/lookup", requireAuth, (req: Request, res: Response) => {
    const location = (req.query.location as string) || "";
    if (!location) {
      return res.status(400).json({ error: "location query parameter required" });
    }
    const entry = lookupCountryRiskPremium(location);
    if (!entry) {
      return res.json({ found: false, country: null, crp: null });
    }
    return res.json({ found: true, ...entry });
  });
}
