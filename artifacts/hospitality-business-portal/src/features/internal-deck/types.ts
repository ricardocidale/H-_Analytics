/**
 * Mirror of artifacts/api-server/src/slides/types.ts.
 *
 * Cross-artifact imports are forbidden by the workspace contract, so the
 * portal carries its own copy of the SlidePayload shape. Both files MUST
 * stay in sync; the api-server is the source of truth.
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

export interface PropertyImprovement {
  feature: string;
  existing: string;
  proposed: string;
}

export interface VisionText {
  cinematicCaption: string;
  visionHeadline: string;
  visionBullet1: string;
  visionBullet2: string;
  badgeText: string;
  descriptionParagraph: string;
  investmentModelConcept: string;
  marketRationale: string;
  reason1Label: string; reason1Detail: string;
  reason2Label: string; reason2Detail: string;
  reason3Label: string; reason3Detail: string;
  closingLine: string;
  transformationDescription: string;
  operationalModelText: string;
  revenueBullet: string;
  programmingBullet: string;
  operationalParagraph: string;
}

export interface SlidePayload {
  property: SlideProperty;
  photos: SlidePhoto[];
  financials: SlideFinancials;
  siblings: SiblingProperty[];
  /** @deprecated legacy LLM shape — being removed once the new renderers land (T008). Use deckPayloadV2 + deterministic templates instead. */
  visionText: VisionText;
  /** @deprecated legacy LLM shape — being removed once the new renderers land (T008). */
  improvements: PropertyImprovement[];
  /**
   * Editor-authored sidecar copy from `property_deck_payloads`. Holds the
   * human-only and LLM-draft+human-approved slots for the new 6-slide
   * canonical renderer. Always present — `EMPTY_DECK_PAYLOAD_V2` when no
   * editor row exists yet. Renderers fall back to deterministic per-slot
   * templates for any missing slot.
   */
  deckPayloadV2: import("@shared/deck-payload-v2").DeckPayloadV2;
  slide4HeroBase64?: string;
}
