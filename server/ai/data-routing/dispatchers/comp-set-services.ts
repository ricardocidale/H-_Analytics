/**
 * Comp-set dispatchers — Apify (Airbnb / VRBO / TripAdvisor),
 * RapidAPI (Booking.com, Zillow). These services produce competitive-set
 * listing data for nightly rates.
 */
import type { ApifyService } from "../../../services/ApifyService";
import type { RapidApiHospitalityService } from "../../../services/RapidApiHospitalityService";
import type { DispatchHandler } from "./_shared";

const apify: DispatchHandler = async (serviceKey, field, rCtx, _ctx, svc) => {
  if (!rCtx.location) return null;
  const apify: ApifyService = svc.instance;
  const data = await apify.fetchCompSetData(rCtx.location);
  if (!data) return null;

  if (field === "startAdr" || field === "nightlyPropertyRate") {
    if (serviceKey === "apify-airbnb" && data.airbnb?.avgNightlyRate) {
      const v = data.airbnb.avgNightlyRate.value;
      const r = data.airbnb.priceRange;
      return {
        value: v,
        range: r ? { low: r.min, mid: v, high: r.max } : undefined,
        provenance: `Apify Airbnb, ${data.airbnb.listingCount} listings, ${rCtx.location}, L${rCtx.level}`,
      };
    }
    if (serviceKey === "apify-vrbo" && data.vrbo?.avgNightlyRate) {
      const v = data.vrbo.avgNightlyRate.value;
      const r = data.vrbo.priceRange;
      return {
        value: v,
        range: r ? { low: r.min, mid: v, high: r.max } : undefined,
        provenance: `Apify VRBO, ${data.vrbo.listingCount} listings, ${rCtx.location}, L${rCtx.level}`,
      };
    }
  }
  if (field === "avgTicketFB" && serviceKey === "apify-tripadvisor" && data.tripadvisor) {
    return null;
  }
  return null;
};

const rapidApiBooking: DispatchHandler = async (_serviceKey, field, rCtx, _ctx, svc) => {
  if (!rCtx.location) return null;
  const rapid: RapidApiHospitalityService = svc.instance;
  const data = await rapid.fetchCompSetData(rCtx.location);
  if (!data || !data.booking) return null;
  if (field === "startAdr" && data.booking.avgNightlyRate) {
    const v = data.booking.avgNightlyRate.value;
    const r = data.booking.priceRange;
    return {
      value: v,
      range: r ? { low: r.min, mid: v, high: r.max } : undefined,
      provenance: `RapidAPI Booking.com, ${data.booking.hotelCount} hotels, ${rCtx.location}, L${rCtx.level}`,
    };
  }
  return null;
};

const rapidApiZillow: DispatchHandler = async () => {
  // Zillow for property tax — would require property-specific lookup.
  return null;
};

export const handlers: Record<string, DispatchHandler> = {
  "apify-airbnb": apify,
  "apify-vrbo": apify,
  "apify-tripadvisor": apify,
  "rapidapi-booking": rapidApiBooking,
  "rapidapi-zillow": rapidApiZillow,
};
