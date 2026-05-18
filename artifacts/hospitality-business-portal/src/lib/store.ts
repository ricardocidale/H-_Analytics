import { create } from "zustand";
import { PropertyStatus, DEFAULT_MODEL_START_DATE } from "@shared/constants";
import {
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  DEFAULT_LTV,
  DEFAULT_REFI_LTV,
  DEFAULT_REFI_CLOSING_COST_RATE,
  DEFAULT_ACQ_CLOSING_COST_RATE,
  DEFAULT_STAFF_SALARY,
  DEFAULT_OFFICE_LEASE,
  DEFAULT_PROFESSIONAL_SERVICES,
  DEFAULT_TECH_INFRA,
  DEFAULT_TRAVEL_PER_CLIENT,
  DEFAULT_IT_LICENSE_PER_CLIENT,
} from './constants';

// --- LOCAL STORE TYPES (legacy — canonical types live in shared/schema.ts) ---
// These types are used only by the local Zustand store for client-side fallback data.
// For database-backed GlobalAssumptions, import from "@shared/schema" instead.
interface StoreGlobalAssumptions {
  modelStartDate: string;
  inflationRate: number; // 0.03
  partnerSalary: number; // 150000
  staffSalary: number; // 75000
  travelCostPerClient: number; // 12000
  itLicensePerClient: number; // 3000
  marketingRate: number; // 0.05
  miscOpsRate: number; // 0.03
  officeLeaseStart: number; // 36000
  professionalServicesStart: number; // 24000
  techInfraStart: number; // 18000
  standardAcqPackage: {
    purchasePrice: number; // 2300000
    buildingImprovements: number; // 800000
    preOpeningCosts: number; // 150000
    operatingReserve: number; // 200000
    monthsToOps: number; // 6
  };
  debtAssumptions: {
    interestRate: number; // 0.09
    amortizationYears: number; // 25
    refiLTV: number; // 0.75
    refiClosingCostRate: number; // 0.03
    acqLTV: number; // 0.75
    acqClosingCostRate: number; // 0.02
  };
}

interface StoreProperty {
  id: string;
  name: string;
  location: string;
  market: "North America" | "Latin America";
  imageUrl: string;
  status: typeof PropertyStatus[keyof typeof PropertyStatus];
  
  // Timeline
  acquisitionDate: string;
  operationsStartDate: string;
  
  // Development / Acquisition Costs
  purchasePrice: number;
  buildingImprovements: number;
  preOpeningCosts: number;
  operatingReserve: number;
  
  // Operations Specs
  roomCount: number;
  startAdr: number;
  adrGrowthRate: number;
  startOccupancy: number; // 0.60
  maxOccupancy: number; // 0.90
  occupancyRampMonths: number; // 6 months per step
  occupancyGrowthStep: number; // 0.05
  // Financial Config
  type: "Full Equity" | "Financed";
  
  // Operating Cost Rates (should sum to 100%)
  costRateRooms: number;
  costRateFB: number;
  costRateAdmin: number;
  costRateMarketing: number;
  costRatePropertyOps: number;
  costRateUtilities: number;
  costRateTaxes: number;
  costRateIT: number;
  costRateFFE: number;
  streetAddress?: string;
}

// --- STORE STATE ---
interface AppState {
  global: StoreGlobalAssumptions;
  properties: StoreProperty[];

  // Actions
  updateGlobal: (data: Partial<StoreGlobalAssumptions>) => void;
  updateProperty: (id: string, data: Partial<StoreProperty>) => void;
  addProperty: (property: Omit<StoreProperty, "id">) => void;
  deleteProperty: (id: string) => void;
}

// --- INITIAL DATA ---
// This is dev/fallback-only state that Zustand seeds the store with before
// the first API fetch completes. Every page and component guards against
// the loading state, so these literals are never rendered to end users in
// production. They exist as a type-system placeholder + a local-dev
// convenience when the API is unavailable.
//
// This data does NOT need to match server/seeds/property-data.ts. The
// server seed is the real production seed; this is a demo fixture.
// `rewritetax.md` originally flagged this as drift but the risk is
// negligible — see the scoreboard for the downgraded assessment.
const INITIAL_GLOBAL: StoreGlobalAssumptions = {
  modelStartDate: DEFAULT_MODEL_START_DATE,
  inflationRate: 0.03,
  partnerSalary: 150000,
  staffSalary: DEFAULT_STAFF_SALARY,
  travelCostPerClient: DEFAULT_TRAVEL_PER_CLIENT,
  itLicensePerClient: DEFAULT_IT_LICENSE_PER_CLIENT,
  marketingRate: 0.05,
  miscOpsRate: 0.03,
  officeLeaseStart: DEFAULT_OFFICE_LEASE,
  professionalServicesStart: DEFAULT_PROFESSIONAL_SERVICES,
  techInfraStart: DEFAULT_TECH_INFRA,
  standardAcqPackage: {
    purchasePrice: 2300000,
    buildingImprovements: 800000,
    preOpeningCosts: 150000,
    operatingReserve: 200000,
    monthsToOps: 6
  },
  debtAssumptions: {
    interestRate: DEFAULT_INTEREST_RATE,
    amortizationYears: DEFAULT_TERM_YEARS,
    refiLTV: DEFAULT_REFI_LTV,
    refiClosingCostRate: DEFAULT_REFI_CLOSING_COST_RATE,
    acqLTV: DEFAULT_LTV,
    acqClosingCostRate: DEFAULT_ACQ_CLOSING_COST_RATE
  }
};

const INITIAL_PROPERTIES: StoreProperty[] = [
  {
    id: "prop-1",
    name: "The Hudson Estate",
    streetAddress: "47 Ridgeview Lane, Rhinebeck, NY 12572",
    location: "Upstate New York",
    market: "North America",
    imageUrl: "/api/media/property-ny.png",
    status: PropertyStatus.PIPELINE,
    acquisitionDate: "2026-06-01",
    operationsStartDate: "2026-12-01",
    purchasePrice: 2300000, // Standard
    buildingImprovements: 800000,
    preOpeningCosts: 150000,
    operatingReserve: 200000,
    roomCount: 20,
    startAdr: 275,
    adrGrowthRate: 0.025,
    startOccupancy: 0.60,
    maxOccupancy: 0.90,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,

    type: "Full Equity",
    costRateRooms: 0.20,
    costRateFB: 0.085,
    costRateAdmin: 0.08,
    costRateMarketing: 0.01,
    costRatePropertyOps: 0.04,
    costRateUtilities: 0.05,
    costRateTaxes: 0.03,
    costRateIT: 0.005,
    costRateFFE: 0.04
  },
  {
    id: "prop-2",
    name: "Eden Summit Lodge",
    streetAddress: "1280 Powder Mountain Road, Eden, UT 84310",
    location: "Eden, Utah",
    market: "North America",
    imageUrl: "/api/media/property-utah.png",
    status: PropertyStatus.IN_NEGOTIATION,
    acquisitionDate: "2027-01-01",
    operationsStartDate: "2027-07-01",
    purchasePrice: 2300000,
    buildingImprovements: 800000,
    preOpeningCosts: 150000,
    operatingReserve: 200000,
    roomCount: 20,
    startAdr: 325,
    adrGrowthRate: 0.025,
    startOccupancy: 0.60,
    maxOccupancy: 0.90,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,

    type: "Full Equity",
    costRateRooms: 0.20,
    costRateFB: 0.085,
    costRateAdmin: 0.08,
    costRateMarketing: 0.01,
    costRatePropertyOps: 0.04,
    costRateUtilities: 0.05,
    costRateTaxes: 0.03,
    costRateIT: 0.005,
    costRateFFE: 0.04
  },
  {
    id: "prop-3",
    name: "Austin Hillside",
    streetAddress: "3200 Balcones Crest Drive, Austin, TX 78731",
    location: "Austin, Texas",
    market: "North America",
    imageUrl: "/api/media/property-austin.png",
    status: PropertyStatus.IN_NEGOTIATION,
    acquisitionDate: "2027-07-01",
    operationsStartDate: "2028-01-01",
    purchasePrice: 2300000,
    buildingImprovements: 800000,
    preOpeningCosts: 150000,
    operatingReserve: 200000,
    roomCount: 20,
    startAdr: 225,
    adrGrowthRate: 0.025,
    startOccupancy: 0.60,
    maxOccupancy: 0.90,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,

    type: "Full Equity",
    costRateRooms: 0.20,
    costRateFB: 0.09,
    costRateAdmin: 0.08,
    costRateMarketing: 0.01,
    costRatePropertyOps: 0.04,
    costRateUtilities: 0.05,
    costRateTaxes: 0.03,
    costRateIT: 0.005,
    costRateFFE: 0.04
  },
  {
    id: "prop-4",
    name: "Casa Medellín",
    streetAddress: "Calle 10A #34-15, El Poblado, Medellín, Antioquia",
    location: "Medellín, Colombia",
    market: "Latin America",
    imageUrl: "/api/media/property-medellin.png",
    status: PropertyStatus.IN_NEGOTIATION,
    acquisitionDate: "2028-01-01",
    operationsStartDate: "2028-07-01",
    purchasePrice: 2300000,
    buildingImprovements: 800000,
    preOpeningCosts: 150000,
    operatingReserve: 200000,
    roomCount: 20,
    startAdr: 150,
    adrGrowthRate: 0.04,
    startOccupancy: 0.60,
    maxOccupancy: 0.90,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,

    type: "Financed",
    costRateRooms: 0.20,
    costRateFB: 0.075,
    costRateAdmin: 0.08,
    costRateMarketing: 0.01,
    costRatePropertyOps: 0.04,
    costRateUtilities: 0.05,
    costRateTaxes: 0.03,
    costRateIT: 0.005,
    costRateFFE: 0.04
  },
  {
    id: "prop-5",
    name: "Blue Ridge Manor",
    streetAddress: "815 Overlook Parkway, Asheville, NC 28804",
    location: "Asheville, North Carolina",
    market: "North America",
    imageUrl: "/api/media/property-asheville.png",
    status: PropertyStatus.IN_NEGOTIATION,
    acquisitionDate: "2028-01-01",
    operationsStartDate: "2028-07-01",
    purchasePrice: 2300000,
    buildingImprovements: 800000,
    preOpeningCosts: 150000,
    operatingReserve: 200000,
    roomCount: 20,
    startAdr: 285,
    adrGrowthRate: 0.025,
    startOccupancy: 0.60,
    maxOccupancy: 0.90,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,

    type: "Financed",
    costRateRooms: 0.20,
    costRateFB: 0.10,
    costRateAdmin: 0.08,
    costRateMarketing: 0.01,
    costRatePropertyOps: 0.04,
    costRateUtilities: 0.05,
    costRateTaxes: 0.03,
    costRateIT: 0.005,
    costRateFFE: 0.04
  }
];

export const useStore = create<AppState>((set) => ({
  global: INITIAL_GLOBAL,
  properties: INITIAL_PROPERTIES,
  
  updateGlobal: (data) => set((state) => ({ 
    global: { ...state.global, ...data } 
  })),
  
  updateProperty: (id, data) => set((state) => ({
    properties: state.properties.map(p => p.id === id ? { ...p, ...data } : p)
  })),
  
  addProperty: (property) => set((state) => ({
    properties: [...state.properties, { ...property, id: Math.random().toString(36).substring(7) }]
  })),
  
  deleteProperty: (id) => set((state) => ({
    properties: state.properties.filter(p => p.id !== id)
  }))
}));
