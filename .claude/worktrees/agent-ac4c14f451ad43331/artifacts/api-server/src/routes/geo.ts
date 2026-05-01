import type { Express } from "express";
import { Country, State, City } from "country-state-city";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { logger } from "../logger";

export function register(app: Express) {
  app.get("/api/geo/countries", requireAuth, (_req, res) => {
    const countries = Country.getAllCountries().map((c) => ({
      name: c.name,
      isoCode: c.isoCode,
      flag: c.flag,
    }));
    res.json(countries);
  });

  app.get("/api/geo/states", requireAuth, (req, res) => {
    const country = req.query.country as string;
    if (!country) return res.status(400).json({ error: "country query param required" });
    const states = State.getStatesOfCountry(country).map((s) => ({
      name: s.name,
      isoCode: s.isoCode,
    }));
    res.json(states);
  });

  app.get("/api/geo/cities", requireAuth, (req, res) => {
    const country = req.query.country as string;
    const state = req.query.state as string;
    if (!country) return res.status(400).json({ error: "country query param required" });
    const cities = state
      ? City.getCitiesOfState(country, state)
      : City.getCitiesOfCountry(country) || [];
    const mapped = (cities || []).map((c) => ({
      name: c.name,
      stateCode: c.stateCode,
      latitude: c.latitude,
      longitude: c.longitude,
    }));
    res.json(mapped);
  });

  app.get("/api/geo/default-locations", requireAuth, async (_req, res) => {
    try {
      const rows = await storage.getDistinctPropertyLocations();

      const allCountries = Country.getAllCountries();
      const grouped: Record<string, { states: Record<string, string[]> }> = {};

      for (const row of rows) {
        const countryName = row.country;
        if (!grouped[countryName]) grouped[countryName] = { states: {} };
        const state = row.stateProvince;
        if (!grouped[countryName].states[state]) grouped[countryName].states[state] = [];
        const city = row.city;
        if (city) grouped[countryName].states[state].push(city);
      }

      const locations = Object.entries(grouped).map(([countryName, data], idx) => {
        const country = allCountries.find((c) => c.name === countryName);
        const countryCode = country?.isoCode || "";
        const countryStates = countryCode ? State.getStatesOfCountry(countryCode) : [];

        const stateCodes: string[] = [];
        const cities: { name: string; radius: number }[] = [];

        for (const [stateName, cityNames] of Object.entries(data.states)) {
          const stateMatch = countryStates.find(
            (s) => s.name === stateName || s.isoCode === stateName
          );
          if (stateMatch && !stateCodes.includes(stateMatch.isoCode)) {
            stateCodes.push(stateMatch.isoCode);
          }
          for (const cn of cityNames) {
            if (!cities.some((c) => c.name === cn)) {
              cities.push({ name: cn, radius: 50 });
            }
          }
        }

        return {
          id: `default-${idx}-${Date.now()}`,
          country: countryName,
          countryCode,
          states: stateCodes,
          cities,
          notes: "",
        };
      });

      res.json(locations);
    } catch (err: unknown) {
      logger.error(`Failed to build default locations: ${err instanceof Error ? err.message : err}`, "geo");
      res.status(500).json({ error: "Failed to build default locations" });
    }
  });
}
