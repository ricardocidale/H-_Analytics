/**
 * Shared slide payload types — neutral home for the data shape consumed by
 * the per-property Playwright PDF deck generator.
 */

export interface SlidePhoto {
  url?: string;
  base64?: string;
  isHero: boolean;
  sortOrder: number;
}

export interface YearlyIS {
  year: number;
  revenueTotal: number;
  totalExpenses: number;
  noi: number;
  gop: number;
  operationalMonthsInYear: number;
  soldRooms: number;
  availableRooms: number;
  cleanAdr: number;
}

export interface YearlyCF {
  year: number;
  debtService: number;
  netCashFlowToInvestors: number;
  cumulativeCashFlow: number;
  exitValue: number;
}

export interface SlideFinancials {
  yearlyIS: YearlyIS[];
  yearlyCF: YearlyCF[];
  loanAmount: number;
  loanLtv: number;
  annualDebtService: number;
  renovationBudget: number;
  irr?: number;
  equityMultiple?: number;
  exitCapRate?: number;
}

export interface SlideProperty {
  id: number;
  name: string;
  city: string;
  stateProvince: string;
  county: string;
  country: string;
  purchasePrice: number;
  roomCount: number;
  startAdr: number;
  maxOccupancy: number;
  businessModel: string;
  hospitalityType: string;
  qualityTier: string;
  description: string;
  acquisitionStatus: string;
  isHistoric?: boolean | string;
  renovationScope?: string;
  exitCapRate?: number;
}

export interface SiblingProperty {
  id: number;
  name: string;
  city?: string;
  stateProvince?: string;
  purchasePrice?: number;
  hospitalityType?: string;
  acquisitionStatus?: string;
  heroPhotoBase64?: string;
}

export interface SlidePayload {
  property: SlideProperty;
  photos: SlidePhoto[];
  financials: SlideFinancials;
  siblings: SiblingProperty[];
  /**
   * Editor-authored sidecar copy from `property_deck_payloads`. Holds the
   * human-only and LLM-draft+human-approved slots for the new 6-slide
   * canonical renderer. Always present — `EMPTY_DECK_PAYLOAD_V2` when no
   * editor row exists yet. Renderers fall back to deterministic per-slot
   * templates for any missing slot.
   */
  deckPayloadV2: import("@shared/deck-payload-v2").DeckPayloadV2;
  slide4HeroBase64?: string;
  /**
   * LB Slide Deck overrides — additive optional fields.
   * Never set by buildSlidePayload (per-property pipeline uses defaults).
   * Set by buildLbPayload for the composite portfolio deck only.
   */
  projYears?: number;      // override PROFORMA_YEARS for Slide 6 (e.g. 10 for LB deck)
  usaliMode?: boolean;     // when true, Slide 6 renders the USALI table PNG
  usaliPngBase64?: string; // base64 PNG of the IS table, rendered server-side (LB deck Slide 6)
}
