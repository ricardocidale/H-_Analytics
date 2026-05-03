/**
 * Shared slide payload types — neutral home for the data shape consumed by
 * the per-property deck generators (Python python-pptx track and Playwright
 * PDF track).
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
  visionText: VisionText;
  improvements: PropertyImprovement[];
  slide4HeroBase64?: string;
}
