/**
 * server/ai/icp/portfolio-analysis.ts — Phase 1 of ICP generation.
 *
 * Deterministic reverse-engineering of an `ICP PortfolioAnalysis` from the
 * existing property portfolio. No LLM calls; pure aggregation. The output
 * feeds the config builder, the LLM prompt, and the descriptive fallbacks.
 */

import type { Property } from "@workspace/db";
import type { PortfolioAnalysis } from "@shared/icp-types";
import { aggregateNullable, aggregateNumeric, countMap, dominant } from "./helpers";

export function emptyPortfolioAnalysis(): PortfolioAnalysis {
  const zero = { min: 0, max: 0, median: 0, mean: 0 };
  return {
    propertyCount: 0,
    rooms: zero, adr: zero, occupancy: zero, maxOccupancy: zero, purchasePrice: zero,
    acreage: null, buildingSqft: null, fbSeats: null, eventSpaceSqft: null, fbVenues: null,
    revShareFB: null, revShareEvents: null,
    qualityTiers: {}, businessModels: {}, countries: [], regions: [], locations: [],
    dominantQualityTier: "upscale", dominantBusinessModel: "hotel",
    isInternational: false, hasFB: false, hasEvents: false, fbRating: 1,
  };
}

export function analyzePortfolio(properties: Property[]): PortfolioAnalysis {
  const active = properties.filter(p => p.archivedAt == null);
  if (active.length === 0) {
    return emptyPortfolioAnalysis();
  }

  const rooms = aggregateNumeric(active.map(p => p.roomCount ?? 0).filter(v => v > 0));
  const adr = aggregateNumeric(active.map(p => p.startAdr ?? 0).filter(v => v > 0));
  const occ = aggregateNumeric(active.map(p => (p.startOccupancy ?? 0)).filter(v => v > 0));
  const maxOcc = aggregateNumeric(active.map(p => (p.maxOccupancy ?? 0)).filter(v => v > 0));
  const price = aggregateNumeric(active.map(p => p.purchasePrice ?? 0).filter(v => v > 0));

  const acreage = aggregateNullable(active.map(p => p.totalPropertyAcreage));
  const sqft = aggregateNullable(active.map(p => p.totalBuildingSqft));
  const seats = aggregateNullable(active.map(p => p.fbSeats));
  const eventSqft = aggregateNullable(active.map(p => p.eventSpaceSqft));
  const venues = aggregateNullable(active.map(p => p.fbVenues));

  const fbShares = active.map(p => p.revShareFB).filter((v): v is number => v != null && v > 0);
  const evtShares = active.map(p => p.revShareEvents).filter((v): v is number => v != null && v > 0);

  const qualityTiers = countMap(active.map(p => p.qualityTier));
  const businessModels = countMap(active.map(p => p.businessModel));
  const countries = Array.from(new Set(active.map(p => p.country).filter((c): c is string => c != null)));

  const regions: string[] = [];
  const locations: Array<{ city?: string; state?: string; country: string }> = [];
  for (const p of active) {
    if (p.stateProvince) regions.push(p.stateProvince);
    if (p.city) regions.push(p.city);
    locations.push({
      city: p.city ?? undefined,
      state: p.stateProvince ?? undefined,
      country: p.country ?? "US",
    });
  }

  // F&B rating: 1-5 based on venues and seats
  let fbRating = 1;
  const avgVenues = venues ? venues.mean : 0;
  const avgSeats = seats ? seats.mean : 0;
  if (avgVenues >= 3 && avgSeats >= 60) fbRating = 5;
  else if (avgVenues >= 2 && avgSeats >= 40) fbRating = 4;
  else if (avgVenues >= 1 && avgSeats >= 20) fbRating = 3;
  else if (avgSeats > 0) fbRating = 2;

  return {
    propertyCount: active.length,
    rooms,
    adr,
    occupancy: occ,
    maxOccupancy: maxOcc,
    purchasePrice: price,
    acreage,
    buildingSqft: sqft,
    fbSeats: seats,
    eventSpaceSqft: eventSqft,
    fbVenues: venues,
    revShareFB: fbShares.length > 0 ? { min: Math.min(...fbShares), max: Math.max(...fbShares), mean: fbShares.reduce((s, v) => s + v, 0) / fbShares.length } : null,
    revShareEvents: evtShares.length > 0 ? { min: Math.min(...evtShares), max: Math.max(...evtShares), mean: evtShares.reduce((s, v) => s + v, 0) / evtShares.length } : null,
    qualityTiers,
    businessModels,
    countries,
    regions: Array.from(new Set(regions)),
    locations,
    dominantQualityTier: dominant(qualityTiers) || "upscale",
    dominantBusinessModel: dominant(businessModels) || "hotel",
    isInternational: countries.length > 1 || (countries.length === 1 && countries[0] !== "US" && countries[0] !== "United States"),
    hasFB: (venues?.mean ?? 0) > 0 || fbShares.length > 0,
    hasEvents: (eventSqft?.mean ?? 0) > 0 || evtShares.length > 0,
    fbRating,
  };
}
