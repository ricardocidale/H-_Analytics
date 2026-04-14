/**
 * Market Data Tables Seed — Seeds all 6 pre-collected hospitality market data tables.
 *
 * These tables are queried INSTANTLY by the smart data router (priority 0)
 * instead of making expensive API calls. Updated asynchronously on schedules.
 *
 * Only inserts rows that don't already exist. Safe to re-run without duplicates.
 */

import { db } from "../db";
import {
  marketAdrIndex, seasonalCalendars, eventCalendars,
  laborRates, fbBenchmarks,
} from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "../logger";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Market ADR Index
// ═══════════════════════════════════════════════════════════════════════════

const ADR_SEEDS = [
  {
    market: "New York City", country: "US", quarter: "2025-Q1",
    avgAdr: 305, luxuryAdr: 550, upscaleAdr: 350, midscaleAdr: 200, economyAdr: 140, boutiqueAdr: 400,
    avgOccupancy: 72.5, avgRevpar: 221,
    source: "Industry composite / H+ Research", sourceUrl: null,
  },
  {
    market: "Catskills NY", country: "US", quarter: "2025-Q1",
    avgAdr: 225, luxuryAdr: 350, upscaleAdr: 250, midscaleAdr: 150, economyAdr: 95, boutiqueAdr: 300,
    avgOccupancy: 52.0, avgRevpar: 117,
    source: "Industry composite / H+ Research", sourceUrl: null,
  },
  {
    market: "Miami", country: "US", quarter: "2025-Q1",
    avgAdr: 285, luxuryAdr: 500, upscaleAdr: 300, midscaleAdr: 180, economyAdr: 130, boutiqueAdr: 380,
    avgOccupancy: 74.0, avgRevpar: 211,
    source: "Industry composite / H+ Research", sourceUrl: null,
  },
  {
    market: "Medellín", country: "CO", quarter: "2025-Q1",
    avgAdr: 105, luxuryAdr: 180, upscaleAdr: 120, midscaleAdr: 70, economyAdr: 40, boutiqueAdr: 150,
    avgOccupancy: 58.0, avgRevpar: 61,
    source: "Industry composite / H+ Research", sourceUrl: null,
  },
  {
    market: "Cartagena", country: "CO", quarter: "2025-Q1",
    avgAdr: 145, luxuryAdr: 250, upscaleAdr: 160, midscaleAdr: 90, economyAdr: 55, boutiqueAdr: 200,
    avgOccupancy: 62.0, avgRevpar: 90,
    source: "Industry composite / H+ Research", sourceUrl: null,
  },
  {
    market: "London", country: "GB", quarter: "2025-Q1",
    avgAdr: 330, luxuryAdr: 600, upscaleAdr: 350, midscaleAdr: 200, economyAdr: 120, boutiqueAdr: 420,
    avgOccupancy: 76.0, avgRevpar: 251,
    source: "Industry composite / H+ Research", sourceUrl: null,
  },
  {
    market: "San José CR", country: "CR", quarter: "2025-Q1",
    avgAdr: 120, luxuryAdr: 200, upscaleAdr: 130, midscaleAdr: 80, economyAdr: 45, boutiqueAdr: 170,
    avgOccupancy: 55.0, avgRevpar: 66,
    source: "Industry composite / H+ Research", sourceUrl: null,
  },
  {
    market: "Park City UT", country: "US", quarter: "2025-Q1",
    avgAdr: 280, luxuryAdr: 450, upscaleAdr: 300, midscaleAdr: 180, economyAdr: 120, boutiqueAdr: 380,
    avgOccupancy: 60.0, avgRevpar: 168,
    source: "Industry composite / H+ Research", sourceUrl: null,
  },
  {
    market: "Santo Domingo DR", country: "DO", quarter: "2025-Q1",
    avgAdr: 100, luxuryAdr: 180, upscaleAdr: 110, midscaleAdr: 60, economyAdr: 35, boutiqueAdr: 150,
    avgOccupancy: 54.0, avgRevpar: 54,
    source: "Industry composite / H+ Research", sourceUrl: null,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 2. Seasonal Calendars
// ═══════════════════════════════════════════════════════════════════════════

type SeasonalSeed = {
  market: string; country: string; month: number;
  seasonType: string; demandMultiplier: number; avgAdrMultiplier: number; notes: string | null;
};

function buildSeasonalSeeds(): SeasonalSeed[] {
  const seeds: SeasonalSeed[] = [];

  // Catskills NY — peak Jun-Sep (summer/fall foliage), trough Jan-Mar, shoulder Apr-May/Oct-Nov
  const catskills: [string, number, number, string | null][] = [
    ["trough", 0.60, 0.65, "Deep winter — limited demand"],
    ["trough", 0.62, 0.65, "Winter low season"],
    ["trough", 0.65, 0.70, "Late winter — some early spring visitors"],
    ["shoulder", 0.85, 0.85, "Spring shoulder — nature awakening"],
    ["shoulder", 0.90, 0.90, "Late spring — increasing bookings"],
    ["peak", 1.25, 1.20, "Summer peak — outdoor recreation"],
    ["peak", 1.35, 1.30, "Peak summer — festivals and hiking"],
    ["peak", 1.30, 1.25, "Late summer — family vacations"],
    ["peak", 1.40, 1.35, "Fall foliage — highest demand"],
    ["shoulder", 0.95, 0.95, "Shoulder — post-foliage"],
    ["shoulder", 0.80, 0.80, "Late fall — pre-winter lull"],
    ["trough", 0.70, 0.75, "Holiday bump then winter"],
  ];
  catskills.forEach(([type, dm, am, notes], i) => {
    seeds.push({ market: "Catskills NY", country: "US", month: i + 1, seasonType: type, demandMultiplier: dm, avgAdrMultiplier: am, notes });
  });

  // Miami — peak Dec-Apr (winter escape), trough Jul-Sep (hurricane), shoulder May-Jun/Oct-Nov
  const miami: [string, number, number, string | null][] = [
    ["peak", 1.30, 1.30, "Peak winter — snowbird season"],
    ["peak", 1.35, 1.35, "Art fairs, Super Bowl period"],
    ["peak", 1.30, 1.30, "Spring break + Ultra Music Festival"],
    ["peak", 1.20, 1.20, "Late season peak — Easter travel"],
    ["shoulder", 0.90, 0.90, "Shoulder — transition to summer"],
    ["shoulder", 0.85, 0.85, "Early summer — Caribbean competition"],
    ["trough", 0.65, 0.65, "Hurricane season begins"],
    ["trough", 0.60, 0.60, "Peak hurricane season — lowest demand"],
    ["trough", 0.60, 0.60, "Hurricane season continues"],
    ["shoulder", 0.80, 0.80, "Post-hurricane recovery"],
    ["shoulder", 0.90, 0.90, "Art Basel anticipation"],
    ["peak", 1.35, 1.35, "Art Basel + holiday season"],
  ];
  miami.forEach(([type, dm, am, notes], i) => {
    seeds.push({ market: "Miami", country: "US", month: i + 1, seasonType: type, demandMultiplier: dm, avgAdrMultiplier: am, notes });
  });

  // Medellín — peak Dec-Jan, Jun-Jul (festivals), shoulder Mar-May, trough Aug-Nov
  const medellin: [string, number, number, string | null][] = [
    ["peak", 1.25, 1.20, "Holiday season + Alumbrados festival"],
    ["shoulder", 0.95, 0.95, "Post-holiday steady demand"],
    ["shoulder", 0.90, 0.90, "Shoulder — Semana Santa buildup"],
    ["shoulder", 0.95, 0.95, "Semana Santa (Holy Week) travel"],
    ["shoulder", 0.90, 0.90, "Quiet shoulder month"],
    ["peak", 1.20, 1.15, "Festival season — Colombiamoda"],
    ["peak", 1.15, 1.10, "School vacation + festivals"],
    ["trough", 0.75, 0.80, "Feria de las Flores (high event, but oversupply)"],
    ["trough", 0.70, 0.75, "Low season"],
    ["trough", 0.72, 0.75, "Low season continues"],
    ["trough", 0.75, 0.80, "Pre-holiday quiet"],
    ["peak", 1.30, 1.25, "Christmas/New Year — peak season"],
  ];
  medellin.forEach(([type, dm, am, notes], i) => {
    seeds.push({ market: "Medellín", country: "CO", month: i + 1, seasonType: type, demandMultiplier: dm, avgAdrMultiplier: am, notes });
  });

  // NYC — peak Sep-Dec, trough Jan-Feb, shoulder Mar-Aug
  const nyc: [string, number, number, string | null][] = [
    ["trough", 0.70, 0.70, "Post-holiday low — coldest month"],
    ["trough", 0.72, 0.72, "Fashion Week bump but still low overall"],
    ["shoulder", 0.85, 0.85, "Spring break visitors begin"],
    ["shoulder", 0.90, 0.90, "Spring tourism picks up"],
    ["shoulder", 0.95, 0.95, "Late spring — strong leisure demand"],
    ["shoulder", 1.00, 1.00, "Summer begins — steady"],
    ["shoulder", 0.95, 0.95, "Summer — some corporate drop-off"],
    ["shoulder", 0.95, 0.95, "Late summer"],
    ["peak", 1.25, 1.25, "Fall season — Fashion Week, UN General Assembly"],
    ["peak", 1.30, 1.30, "Peak fall — NYC Marathon month"],
    ["peak", 1.35, 1.35, "Thanksgiving + holiday shopping season"],
    ["peak", 1.40, 1.40, "Holiday season — New Year's Eve peak"],
  ];
  nyc.forEach(([type, dm, am, notes], i) => {
    seeds.push({ market: "New York City", country: "US", month: i + 1, seasonType: type, demandMultiplier: dm, avgAdrMultiplier: am, notes });
  });

  // Park City UT — peak Dec-Mar (ski), Jun-Aug (summer), trough Apr-May/Oct-Nov
  const parkCity: [string, number, number, string | null][] = [
    ["peak", 1.40, 1.40, "Sundance Film Festival + ski peak"],
    ["peak", 1.30, 1.30, "President's Day ski week"],
    ["peak", 1.20, 1.20, "Spring skiing"],
    ["trough", 0.60, 0.60, "Mud season — resort transition"],
    ["trough", 0.65, 0.65, "Late mud season — pre-summer"],
    ["peak", 1.15, 1.15, "Summer hiking/biking season begins"],
    ["peak", 1.25, 1.25, "Peak summer — mountain activities"],
    ["peak", 1.20, 1.20, "Late summer activities"],
    ["shoulder", 0.90, 0.90, "Early fall — shoulder"],
    ["trough", 0.65, 0.65, "Pre-ski lull"],
    ["trough", 0.70, 0.70, "Thanksgiving bump — early ski"],
    ["peak", 1.35, 1.35, "Holiday ski season peak"],
  ];
  parkCity.forEach(([type, dm, am, notes], i) => {
    seeds.push({ market: "Park City UT", country: "US", month: i + 1, seasonType: type, demandMultiplier: dm, avgAdrMultiplier: am, notes });
  });

  return seeds;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Event Calendars
// ═══════════════════════════════════════════════════════════════════════════

const EVENT_SEEDS = [
  // NYC
  { market: "New York City", country: "US", eventName: "New York Fashion Week (Feb)", startMonth: 2, endMonth: 2, specificDate: null, demandImpact: "high", isRecurring: true, category: "fashion", estimatedAttendees: 230000, notes: "Major fashion industry event — drives luxury hotel demand" },
  { market: "New York City", country: "US", eventName: "New York Fashion Week (Sep)", startMonth: 9, endMonth: 9, specificDate: null, demandImpact: "high", isRecurring: true, category: "fashion", estimatedAttendees: 230000, notes: "Fall fashion week — premium ADR impact" },
  { market: "New York City", country: "US", eventName: "NYC Marathon", startMonth: 11, endMonth: 11, specificDate: null, demandImpact: "high", isRecurring: true, category: "sports", estimatedAttendees: 50000, notes: "50K+ runners plus spectators — citywide hotel demand surge" },
  { market: "New York City", country: "US", eventName: "New Year's Eve", startMonth: 12, endMonth: 12, specificDate: null, demandImpact: "high", isRecurring: true, category: "cultural", estimatedAttendees: 1000000, notes: "Times Square ball drop — highest ADR night of the year" },
  { market: "New York City", country: "US", eventName: "UN General Assembly", startMonth: 9, endMonth: 9, specificDate: null, demandImpact: "medium", isRecurring: true, category: "conference", estimatedAttendees: 10000, notes: "Drives midtown luxury demand for 2 weeks" },

  // Miami
  { market: "Miami", country: "US", eventName: "Art Basel Miami Beach", startMonth: 12, endMonth: 12, specificDate: null, demandImpact: "high", isRecurring: true, category: "cultural", estimatedAttendees: 83000, notes: "Premier contemporary art fair — massive luxury hotel impact" },
  { market: "Miami", country: "US", eventName: "Ultra Music Festival", startMonth: 3, endMonth: 3, specificDate: null, demandImpact: "high", isRecurring: true, category: "festival", estimatedAttendees: 170000, notes: "Electronic music festival — fills downtown hotels" },
  { market: "Miami", country: "US", eventName: "Miami Swim Week", startMonth: 7, endMonth: 7, specificDate: null, demandImpact: "medium", isRecurring: true, category: "fashion", estimatedAttendees: 20000, notes: "Swimwear fashion event — offsets summer low season" },
  { market: "Miami", country: "US", eventName: "Miami Grand Prix (F1)", startMonth: 5, endMonth: 5, specificDate: null, demandImpact: "high", isRecurring: true, category: "sports", estimatedAttendees: 242000, notes: "Formula 1 race — premium pricing across all hotels" },

  // Medellín
  { market: "Medellín", country: "CO", eventName: "Feria de las Flores", startMonth: 8, endMonth: 8, specificDate: null, demandImpact: "high", isRecurring: true, category: "festival", estimatedAttendees: 500000, notes: "Flower festival — largest annual event, citywide impact" },
  { market: "Medellín", country: "CO", eventName: "Festival Internacional de Tango", startMonth: 6, endMonth: 6, specificDate: null, demandImpact: "medium", isRecurring: true, category: "cultural", estimatedAttendees: 100000, notes: "Tango festival draws international visitors" },
  { market: "Medellín", country: "CO", eventName: "Colombiamoda", startMonth: 7, endMonth: 7, specificDate: null, demandImpact: "medium", isRecurring: true, category: "fashion", estimatedAttendees: 40000, notes: "Latin America's largest fashion trade show" },

  // Catskills
  { market: "Catskills NY", country: "US", eventName: "Bethel Woods Concert Season", startMonth: 6, endMonth: 9, specificDate: null, demandImpact: "medium", isRecurring: true, category: "festival", estimatedAttendees: 150000, notes: "Summer concert series at original Woodstock site" },
  { market: "Catskills NY", country: "US", eventName: "Fall Foliage Season", startMonth: 9, endMonth: 10, specificDate: null, demandImpact: "high", isRecurring: true, category: "cultural", estimatedAttendees: null, notes: "Peak leaf-peeping season — highest occupancy of the year" },
  { market: "Catskills NY", country: "US", eventName: "Catskill Mountain Film Festival", startMonth: 10, endMonth: 10, specificDate: null, demandImpact: "low", isRecurring: true, category: "cultural", estimatedAttendees: 5000, notes: "Regional film festival — modest incremental demand" },

  // Park City
  { market: "Park City UT", country: "US", eventName: "Sundance Film Festival", startMonth: 1, endMonth: 1, specificDate: null, demandImpact: "high", isRecurring: true, category: "cultural", estimatedAttendees: 120000, notes: "Premiere indie film festival — ADR triples during event" },
  { market: "Park City UT", country: "US", eventName: "Ski Season", startMonth: 12, endMonth: 3, specificDate: null, demandImpact: "high", isRecurring: true, category: "sports", estimatedAttendees: null, notes: "Core ski season — sustained peak demand" },
  { market: "Park City UT", country: "US", eventName: "Park City Arts Festival", startMonth: 8, endMonth: 8, specificDate: null, demandImpact: "medium", isRecurring: true, category: "cultural", estimatedAttendees: 50000, notes: "Top-rated outdoor arts festival" },

  // London
  { market: "London", country: "GB", eventName: "Wimbledon Championships", startMonth: 7, endMonth: 7, specificDate: null, demandImpact: "high", isRecurring: true, category: "sports", estimatedAttendees: 500000, notes: "Grand Slam tennis — premium hotel demand across London" },
  { market: "London", country: "GB", eventName: "Notting Hill Carnival", startMonth: 8, endMonth: 8, specificDate: null, demandImpact: "medium", isRecurring: true, category: "festival", estimatedAttendees: 2000000, notes: "Europe's largest street festival — west London impact" },
  { market: "London", country: "GB", eventName: "London Fashion Week", startMonth: 9, endMonth: 9, specificDate: null, demandImpact: "high", isRecurring: true, category: "fashion", estimatedAttendees: 250000, notes: "Major fashion event — luxury hotel surge" },

  // Cartagena
  { market: "Cartagena", country: "CO", eventName: "Hay Festival Cartagena", startMonth: 1, endMonth: 2, specificDate: null, demandImpact: "medium", isRecurring: true, category: "cultural", estimatedAttendees: 45000, notes: "International literary and culture festival" },
  { market: "Cartagena", country: "CO", eventName: "Cartagena Music Festival", startMonth: 1, endMonth: 1, specificDate: null, demandImpact: "medium", isRecurring: true, category: "cultural", estimatedAttendees: 30000, notes: "Classical music festival in historic walled city" },
];

// ═══════════════════════════════════════════════════════════════════════════
// 4. Labor Rates
// ═══════════════════════════════════════════════════════════════════════════

const LABOR_SEEDS = [
  // US — general market rates
  { market: "US General", country: "US", role: "front_desk", hourlyRate: 18.00, annualSalary: 37440, currency: "USD", employmentType: "fte", source: "BLS Occupational Employment & Wage Statistics 2024", sourceUrl: "https://www.bls.gov/oes/", sourceYear: 2024 },
  { market: "US General", country: "US", role: "housekeeping", hourlyRate: 16.00, annualSalary: 33280, currency: "USD", employmentType: "fte", source: "BLS Occupational Employment & Wage Statistics 2024", sourceUrl: "https://www.bls.gov/oes/", sourceYear: 2024 },
  { market: "US General", country: "US", role: "chef_executive", hourlyRate: 36.06, annualSalary: 75000, currency: "USD", employmentType: "fte", source: "BLS Occupational Employment & Wage Statistics 2024", sourceUrl: "https://www.bls.gov/oes/", sourceYear: 2024 },
  { market: "US General", country: "US", role: "general_manager", hourlyRate: 45.67, annualSalary: 95000, currency: "USD", employmentType: "fte", source: "BLS Occupational Employment & Wage Statistics 2024 / HVS salary survey", sourceUrl: "https://www.bls.gov/oes/", sourceYear: 2024 },
  { market: "US General", country: "US", role: "accountant", hourlyRate: null, annualSalary: 60000, currency: "USD", employmentType: "outsourced", source: "Industry average — outsourced hotel accounting", sourceUrl: null, sourceYear: 2024 },
  { market: "US General", country: "US", role: "marketing_manager", hourlyRate: 32.69, annualSalary: 68000, currency: "USD", employmentType: "fte", source: "BLS / Hcareers salary data 2024", sourceUrl: "https://www.bls.gov/oes/", sourceYear: 2024 },
  { market: "US General", country: "US", role: "sous_chef", hourlyRate: 22.00, annualSalary: 45760, currency: "USD", employmentType: "fte", source: "BLS Occupational Employment & Wage Statistics 2024", sourceUrl: "https://www.bls.gov/oes/", sourceYear: 2024 },
  { market: "US General", country: "US", role: "server", hourlyRate: 14.00, annualSalary: 29120, currency: "USD", employmentType: "fte", source: "BLS / hospitality average (tipped)", sourceUrl: "https://www.bls.gov/oes/", sourceYear: 2024 },
  { market: "US General", country: "US", role: "maintenance", hourlyRate: 20.00, annualSalary: 41600, currency: "USD", employmentType: "fte", source: "BLS Occupational Employment & Wage Statistics 2024", sourceUrl: "https://www.bls.gov/oes/", sourceYear: 2024 },

  // NYC — higher cost of living adjustments
  { market: "New York City", country: "US", role: "front_desk", hourlyRate: 22.00, annualSalary: 45760, currency: "USD", employmentType: "fte", source: "BLS NYC metro area 2024", sourceUrl: "https://www.bls.gov/oes/", sourceYear: 2024 },
  { market: "New York City", country: "US", role: "housekeeping", hourlyRate: 20.00, annualSalary: 41600, currency: "USD", employmentType: "fte", source: "BLS NYC metro area 2024", sourceUrl: "https://www.bls.gov/oes/", sourceYear: 2024 },
  { market: "New York City", country: "US", role: "general_manager", hourlyRate: 57.69, annualSalary: 120000, currency: "USD", employmentType: "fte", source: "HVS NYC salary survey 2024", sourceUrl: null, sourceYear: 2024 },

  // Colombia — market rates (stored in USD equivalent for comparison)
  { market: "Medellín", country: "CO", role: "front_desk", hourlyRate: 2.34, annualSalary: 4500, currency: "USD", employmentType: "fte", source: "DANE / Colombian hospitality industry 2024 (COP 1,500,000/mo)", sourceUrl: "https://www.dane.gov.co", sourceYear: 2024 },
  { market: "Medellín", country: "CO", role: "housekeeping", hourlyRate: 2.03, annualSalary: 3900, currency: "USD", employmentType: "fte", source: "DANE / Colombian hospitality industry 2024 (COP 1,300,000/mo)", sourceUrl: "https://www.dane.gov.co", sourceYear: 2024 },
  { market: "Medellín", country: "CO", role: "chef_executive", hourlyRate: 6.25, annualSalary: 12000, currency: "USD", employmentType: "fte", source: "Colombian hospitality industry 2024 (COP 4,000,000/mo)", sourceUrl: null, sourceYear: 2024 },
  { market: "Medellín", country: "CO", role: "general_manager", hourlyRate: 12.50, annualSalary: 24000, currency: "USD", employmentType: "fte", source: "Colombian hospitality industry 2024 (COP 8,000,000/mo)", sourceUrl: null, sourceYear: 2024 },
  { market: "Medellín", country: "CO", role: "server", hourlyRate: 1.72, annualSalary: 3300, currency: "USD", employmentType: "fte", source: "DANE / Colombian minimum wage + hospitality premium (COP 1,100,000/mo)", sourceUrl: "https://www.dane.gov.co", sourceYear: 2024 },

  // Cartagena — slightly higher than Medellín due to tourism premium
  { market: "Cartagena", country: "CO", role: "front_desk", hourlyRate: 2.50, annualSalary: 4800, currency: "USD", employmentType: "fte", source: "DANE / Cartagena tourism sector 2024 (COP 1,600,000/mo)", sourceUrl: "https://www.dane.gov.co", sourceYear: 2024 },
  { market: "Cartagena", country: "CO", role: "housekeeping", hourlyRate: 2.19, annualSalary: 4200, currency: "USD", employmentType: "fte", source: "DANE / Cartagena tourism sector 2024 (COP 1,400,000/mo)", sourceUrl: "https://www.dane.gov.co", sourceYear: 2024 },
  { market: "Cartagena", country: "CO", role: "general_manager", hourlyRate: 14.06, annualSalary: 27000, currency: "USD", employmentType: "fte", source: "Colombian hospitality industry 2024 (COP 9,000,000/mo)", sourceUrl: null, sourceYear: 2024 },
];

// ═══════════════════════════════════════════════════════════════════════════
// 5. F&B Benchmarks
// ═══════════════════════════════════════════════════════════════════════════

const FB_SEEDS = [
  // US Markets — by property type
  {
    market: "US General", country: "US", propertyType: "luxury_hotel",
    avgTicketPerPerson: 65, avgBreakfastTicket: 28, avgLunchTicket: 35, avgDinnerTicket: 65,
    avgBarRevenuePerGuest: 18, coversPerRoomNight: 1.8, cateringCostPerEvent: null,
    fbCostOfGoodsPercent: 30, fbLaborCostPercent: 35,
    source: "USALI 12th Edition / PKF Hospitality Research 2024", sourceUrl: "https://www.pkf.com/hospitality-research", sourceYear: 2024,
  },
  {
    market: "US General", country: "US", propertyType: "boutique",
    avgTicketPerPerson: 45, avgBreakfastTicket: 22, avgLunchTicket: 28, avgDinnerTicket: 45,
    avgBarRevenuePerGuest: 15, coversPerRoomNight: 1.5, cateringCostPerEvent: null,
    fbCostOfGoodsPercent: 32, fbLaborCostPercent: 33,
    source: "USALI 12th Edition / BLLA benchmark data 2024", sourceUrl: "https://www.blla.org", sourceYear: 2024,
  },
  {
    market: "US General", country: "US", propertyType: "resort",
    avgTicketPerPerson: 55, avgBreakfastTicket: 25, avgLunchTicket: 32, avgDinnerTicket: 55,
    avgBarRevenuePerGuest: 20, coversPerRoomNight: 2.0, cateringCostPerEvent: null,
    fbCostOfGoodsPercent: 28, fbLaborCostPercent: 36,
    source: "USALI 12th Edition / STR resort segment 2024", sourceUrl: "https://str.com", sourceYear: 2024,
  },
  {
    market: "US General", country: "US", propertyType: "vrbo",
    avgTicketPerPerson: null, avgBreakfastTicket: null, avgLunchTicket: null, avgDinnerTicket: null,
    avgBarRevenuePerGuest: null, coversPerRoomNight: null, cateringCostPerEvent: 85,
    fbCostOfGoodsPercent: 35, fbLaborCostPercent: null,
    source: "Industry composite — event-based F&B for luxury rentals", sourceUrl: null, sourceYear: 2024,
  },

  // Colombia — adjusted for local market
  {
    market: "Medellín", country: "CO", propertyType: "boutique",
    avgTicketPerPerson: 18, avgBreakfastTicket: 8, avgLunchTicket: 12, avgDinnerTicket: 18,
    avgBarRevenuePerGuest: 8, coversPerRoomNight: 1.4, cateringCostPerEvent: null,
    fbCostOfGoodsPercent: 28, fbLaborCostPercent: 25,
    source: "Cotelco / Colombian hospitality benchmark 2024", sourceUrl: "https://www.cotelco.org", sourceYear: 2024,
  },
  {
    market: "Medellín", country: "CO", propertyType: "luxury_hotel",
    avgTicketPerPerson: 30, avgBreakfastTicket: 12, avgLunchTicket: 18, avgDinnerTicket: 30,
    avgBarRevenuePerGuest: 12, coversPerRoomNight: 1.6, cateringCostPerEvent: null,
    fbCostOfGoodsPercent: 26, fbLaborCostPercent: 22,
    source: "Cotelco / Colombian hospitality benchmark 2024", sourceUrl: "https://www.cotelco.org", sourceYear: 2024,
  },
  {
    market: "Cartagena", country: "CO", propertyType: "boutique",
    avgTicketPerPerson: 25, avgBreakfastTicket: 10, avgLunchTicket: 15, avgDinnerTicket: 25,
    avgBarRevenuePerGuest: 10, coversPerRoomNight: 1.5, cateringCostPerEvent: null,
    fbCostOfGoodsPercent: 29, fbLaborCostPercent: 24,
    source: "Cotelco / Cartagena tourism sector 2024", sourceUrl: "https://www.cotelco.org", sourceYear: 2024,
  },
  {
    market: "Cartagena", country: "CO", propertyType: "luxury_hotel",
    avgTicketPerPerson: 40, avgBreakfastTicket: 15, avgLunchTicket: 22, avgDinnerTicket: 40,
    avgBarRevenuePerGuest: 14, coversPerRoomNight: 1.7, cateringCostPerEvent: null,
    fbCostOfGoodsPercent: 27, fbLaborCostPercent: 23,
    source: "Cotelco / Cartagena tourism sector 2024", sourceUrl: "https://www.cotelco.org", sourceYear: 2024,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Seed Functions
// ═══════════════════════════════════════════════════════════════════════════

async function seedMarketAdrIndex(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const seed of ADR_SEEDS) {
    const existing = await db.select({ id: marketAdrIndex.id })
      .from(marketAdrIndex)
      .where(and(
        eq(marketAdrIndex.market, seed.market),
        eq(marketAdrIndex.quarter, seed.quarter),
      ))
      .limit(1);

    if (existing.length > 0) { skipped++; continue; }

    await db.insert(marketAdrIndex).values(seed);
    inserted++;
  }

  return { inserted, skipped };
}

async function seedSeasonalCalendars(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  const seeds = buildSeasonalSeeds();

  for (const seed of seeds) {
    const existing = await db.select({ id: seasonalCalendars.id })
      .from(seasonalCalendars)
      .where(and(
        eq(seasonalCalendars.market, seed.market),
        eq(seasonalCalendars.month, seed.month),
      ))
      .limit(1);

    if (existing.length > 0) { skipped++; continue; }

    await db.insert(seasonalCalendars).values(seed);
    inserted++;
  }

  return { inserted, skipped };
}

async function seedEventCalendars(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const seed of EVENT_SEEDS) {
    const existing = await db.select({ id: eventCalendars.id })
      .from(eventCalendars)
      .where(and(
        eq(eventCalendars.market, seed.market),
        eq(eventCalendars.eventName, seed.eventName),
      ))
      .limit(1);

    if (existing.length > 0) { skipped++; continue; }

    await db.insert(eventCalendars).values(seed);
    inserted++;
  }

  return { inserted, skipped };
}

async function seedLaborRates(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const seed of LABOR_SEEDS) {
    const existing = await db.select({ id: laborRates.id })
      .from(laborRates)
      .where(and(
        eq(laborRates.market, seed.market),
        eq(laborRates.role, seed.role),
        eq(laborRates.employmentType, seed.employmentType),
      ))
      .limit(1);

    if (existing.length > 0) { skipped++; continue; }

    await db.insert(laborRates).values(seed);
    inserted++;
  }

  return { inserted, skipped };
}

async function seedFbBenchmarks(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const seed of FB_SEEDS) {
    const existing = await db.select({ id: fbBenchmarks.id })
      .from(fbBenchmarks)
      .where(and(
        eq(fbBenchmarks.market, seed.market),
        eq(fbBenchmarks.propertyType, seed.propertyType),
      ))
      .limit(1);

    if (existing.length > 0) { skipped++; continue; }

    await db.insert(fbBenchmarks).values(seed);
    inserted++;
  }

  return { inserted, skipped };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Export
// ═══════════════════════════════════════════════════════════════════════════

export async function seedMarketDataTables(): Promise<void> {
  logger.info("Seeding market data tables (6 tables)...", "seed");

  const results = await Promise.all([
    seedMarketAdrIndex(),
    seedSeasonalCalendars(),
    seedEventCalendars(),
    seedLaborRates(),
    seedFbBenchmarks(),
  ]);

  const [adr, seasonal, events, labor, fb] = results;

  logger.info(`Market ADR Index: ${adr.inserted} inserted, ${adr.skipped} skipped`, "seed");
  logger.info(`Seasonal Calendars: ${seasonal.inserted} inserted, ${seasonal.skipped} skipped`, "seed");
  logger.info(`Event Calendars: ${events.inserted} inserted, ${events.skipped} skipped`, "seed");
  logger.info(`Labor Rates: ${labor.inserted} inserted, ${labor.skipped} skipped`, "seed");
  logger.info(`F&B Benchmarks: ${fb.inserted} inserted, ${fb.skipped} skipped`, "seed");
  // Note: Airport Distances are per-property — seeded when properties are assigned coordinates
  logger.info("Airport Distances: skipped (property-specific, computed on demand)", "seed");

  const totalInserted = adr.inserted + seasonal.inserted + events.inserted + labor.inserted + fb.inserted;
  logger.info(`Market data tables seeding complete: ${totalInserted} total rows inserted`, "seed");
}
