/**
 * Slide pipeline smoke test. Run with:
 *   cd artifacts/api-server
 *   npx tsx --tsconfig tsconfig.json src/slides/_render-harness.ts
 *
 * Validates that the semantic-ID photo routing refactor produces valid JPEG
 * output for all hybrid slides (1-3, 5) using a fixture payload.
 * Output JPEGs are written to /tmp/slide-smoke/ for visual inspection.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { renderHybridSlide } from "./hybrid-renderer.js";
import { getSlideFonts } from "./fonts.js";
import type { SlidePayload } from "./slide-jsx.js";

// ── Generate a solid-color test JPEG large enough for sharp to resize ────────
// 200×150 pixels — small but valid. Each photo gets a distinct hue so we can
// verify visually that the correct photo appears in the correct slot.
async function makeTestJpegB64(r: number, g: number, b: number): Promise<string> {
  const buf = await sharp({
    create: { width: 200, height: 150, channels: 3, background: { r, g, b } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  return buf.toString("base64");
}

function photoEntry(base64: string, isHero: boolean, sortOrder: number) {
  return { base64, isHero, sortOrder };
}

// ── Fixture payload (Hazelnis-style boutique hotel) ─────────────────────────

const FIXTURE: SlidePayload = {
  property: {
    id: 1,
    name: "Hazelnis House",
    city: "Asheville",
    stateProvince: "NC",
    county: "Buncombe County",
    country: "US",
    purchasePrice: 3_200_000,
    roomCount: 12,
    startAdr: 295,
    maxOccupancy: 0.78,
    businessModel: "Boutique Hotel",
    hospitalityType: "boutique hotel",
    qualityTier: "upscale",
    description:
      "A 1920s historic manor converted to a 12-key boutique hotel in the heart of " +
      "downtown Asheville. Features original hardwood floors, curated local art, and " +
      "a garden courtyard. Strong RevPAR driven by year-round Asheville tourism demand.",
    acquisitionStatus: "active",
    isHistoric: true,
    renovationScope: "light",
    exitCapRate: 0.075,
  },
  photos: [
    photoEntry(true, 0),
    photoEntry(false, 1),
    photoEntry(false, 2),
    photoEntry(false, 3),
    photoEntry(false, 4),
    photoEntry(false, 5),
  ],
  financials: {
    yearlyIS: [
      { year: 2025, revenueTotal: 420_000, totalExpenses: 260_000, noi: 160_000, gop: 175_000, operationalMonthsInYear: 8, soldRooms: 2_400, availableRooms: 3_504, cleanAdr: 285 },
      { year: 2026, revenueTotal: 680_000, totalExpenses: 390_000, noi: 290_000, gop: 310_000, operationalMonthsInYear: 12, soldRooms: 3_285, availableRooms: 4_380, cleanAdr: 290 },
      { year: 2027, revenueTotal: 820_000, totalExpenses: 455_000, noi: 365_000, gop: 385_000, operationalMonthsInYear: 12, soldRooms: 3_504, availableRooms: 4_380, cleanAdr: 298 },
      { year: 2028, revenueTotal: 875_000, totalExpenses: 468_000, noi: 407_000, gop: 428_000, operationalMonthsInYear: 12, soldRooms: 3_650, availableRooms: 4_380, cleanAdr: 305 },
      { year: 2029, revenueTotal: 910_000, totalExpenses: 480_000, noi: 430_000, gop: 452_000, operationalMonthsInYear: 12, soldRooms: 3_723, availableRooms: 4_380, cleanAdr: 310 },
    ],
    yearlyCF: [
      { year: 2025, debtService: 175_000, netCashFlowToInvestors: -15_000, cumulativeCashFlow: -15_000, exitValue: 0 },
      { year: 2026, debtService: 175_000, netCashFlowToInvestors: 115_000, cumulativeCashFlow: 100_000, exitValue: 0 },
      { year: 2027, debtService: 175_000, netCashFlowToInvestors: 190_000, cumulativeCashFlow: 290_000, exitValue: 0 },
      { year: 2028, debtService: 175_000, netCashFlowToInvestors: 232_000, cumulativeCashFlow: 522_000, exitValue: 0 },
      { year: 2029, debtService: 175_000, netCashFlowToInvestors: 255_000, cumulativeCashFlow: 777_000, exitValue: 5_730_000 },
    ],
    loanAmount: 2_080_000,
    loanLtv: 0.65,
    annualDebtService: 175_000,
    renovationBudget: 380_000,
    irr: 0.187,
    equityMultiple: 3.4,
    exitCapRate: 0.075,
  },
  siblings: [
    { id: 2, name: "Blue Ridge Inn", city: "Black Mountain", stateProvince: "NC", purchasePrice: 1_800_000, hospitalityType: "boutique hotel", acquisitionStatus: "pipeline" },
    { id: 3, name: "Montford Retreat", city: "Asheville", stateProvince: "NC", purchasePrice: 2_400_000, hospitalityType: "retreat center", acquisitionStatus: "pipeline" },
  ],
  visionText: {
    cinematicCaption: "12 KEYS · BOUTIQUE HOTEL · HISTORIC ASHEVILLE",
    visionHeadline: "A Curated Stay in the Heart of Asheville",
    visionBullet1: "Historic 1920s manor with original architectural details",
    visionBullet2: "Walking distance to River Arts District and downtown dining",
    badgeText: "BOUTIQUE HOTEL",
    descriptionParagraph: "Hazelnis House combines historic charm with modern hospitality in one of America's most vibrant small cities. Year-round demand from cultural tourism creates a durable RevPAR foundation.",
    investmentModelConcept: "Direct ownership with curated local programming and a boutique hotel operator embedded from day one.",
    marketRationale: "Asheville ranks consistently among the top 10 US destination cities. Supply-constrained boutique inventory commands premium ADR with minimal competition from branded chains.",
    reason1Label: "Historic Asset Premium", reason1Detail: "Properties with historic designation command 15–25% ADR premium over comparable non-historic assets in the market.",
    reason2Label: "Operational Efficiency", reason2Detail: "12-key footprint allows owner-operator model with lean staffing and no franchise fees.",
    reason3Label: "Exit Optionality", reason3Detail: "Strong institutional buyer appetite for stabilized boutique hotel assets in Tier 2 markets.",
    closingLine: "A rare opportunity to acquire a stabilized historic asset with immediate cash flow.",
    transformationDescription: "Light renovation preserving historic character while upgrading guest experience to meet upscale expectations.",
    operationalModelText: "Direct ownership, independent operation, local programming partnerships.",
    revenueBullet: "RevPAR of $231 at stabilization — 18% above market comp set",
    programmingBullet: "Curated F&B, art events, and wellness programming driving ancillary revenue",
    operationalParagraph: "The L+B model applies direct ownership and curated programming to boutique hospitality assets, targeting NOI margins of 40–50% through lean operations and strong occupancy.",
  },
  improvements: [
    { feature: "Guest Rooms", existing: "12 dated rooms with worn furnishings", proposed: "12 boutique-designed keys with en-suite baths" },
    { feature: "Common Areas", existing: "Underutilized parlor and dining room", proposed: "Activated lobby bar and event programming space" },
    { feature: "Exterior", existing: "Deferred maintenance on porch and garden", proposed: "Restored wraparound porch and courtyard garden" },
    { feature: "Technology", existing: "Paper-based check-in, no PMS", proposed: "Cloud PMS, keyless entry, direct booking engine" },
  ],
};

// ── Run ──────────────────────────────────────────────────────────────────────

const OUT_DIR = "/tmp/slide-smoke";
fs.mkdirSync(OUT_DIR, { recursive: true });

const fonts = getSlideFonts();
const HYBRID_SLIDES = [1, 2, 3, 5] as const;

let passed = 0;
let failed = 0;

for (const slideNum of HYBRID_SLIDES) {
  process.stdout.write(`  Slide ${slideNum} ... `);
  try {
    const buf = await renderHybridSlide(slideNum, FIXTURE, fonts);
    if (!buf || buf.length === 0) throw new Error("empty buffer");

    // Validate JPEG magic bytes (FF D8 FF)
    if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
      throw new Error(`unexpected magic bytes: ${buf[0].toString(16)} ${buf[1].toString(16)} ${buf[2].toString(16)}`);
    }

    const outPath = path.join(OUT_DIR, `slide-${slideNum}.jpg`);
    fs.writeFileSync(outPath, buf);
    console.log(`PASS  (${(buf.length / 1024).toFixed(0)} KB → ${outPath})`);
    passed++;
  } catch (err) {
    console.error(`FAIL  ${err}`);
    failed++;
  }
}

console.log(`\nSmoke test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
