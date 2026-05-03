import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export interface SlidePhoto {
  id: number;
  url: string;
  isHero: boolean;
  sortOrder: number;
  caption: string;
}

export interface YearlyIS {
  year: number;
  revenueTotal: number;
  totalExpenses: number;
  noi: number;
  gop: number;
  operationalMonthsInYear: number;
  cleanAdr?: number;
  soldRooms?: number;
  availableRooms?: number;
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
  isHistoric: boolean;
  renovationScope: string;
  exitCapRate: number;
}

export interface SlideSibling {
  id: number;
  name: string;
  city?: string;
  stateProvince?: string;
  purchasePrice?: number;
  hospitalityType?: string;
  acquisitionStatus?: string;
}

export interface VisionText {
  cinematicCaption: string;
  visionHeadline: string;
  visionBullet1: string;
  visionBullet2: string;
  badgeText: string;
  descriptionParagraph: string;
  operationalModelText: string;
  revenueBullet: string;
  programmingBullet: string;
  operationalParagraph: string;
  investmentModelConcept: string;
  marketRationale: string;
  reason1Label: string;
  reason1Detail: string;
  reason2Label: string;
  reason2Detail: string;
  reason3Label: string;
  reason3Detail: string;
  closingLine: string;
  transformationDescription: string;
}

export interface PropertyListItem {
  id: number;
  name: string;
  city?: string | null;
  stateProvince?: string | null;
  acquisitionStatus?: string | null;
}

interface PropertyContextValue {
  propertyId: number | null;
  setPropertyId: (id: number) => void;
  property: SlideProperty | null;
  photos: SlidePhoto[];
  financials: SlideFinancials | null;
  siblings: SlideSibling[];
  visionText: VisionText | null;
  allProperties: PropertyListItem[];
  loading: boolean;
  error: string | null;
}

const DEFAULT_CTX: PropertyContextValue = {
  propertyId: null,
  setPropertyId: () => {},
  property: null,
  photos: [],
  financials: null,
  siblings: [],
  visionText: null,
  allProperties: [],
  loading: false,
  error: null,
};

const PropertyContext = createContext<PropertyContextValue>(DEFAULT_CTX);

function getPropertyIdFromUrl(): number | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("propertyId");
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [propertyId, setPropertyIdState] = useState<number | null>(() => getPropertyIdFromUrl());
  const [property, setProperty] = useState<SlideProperty | null>(null);
  const [photos, setPhotos] = useState<SlidePhoto[]>([]);
  const [financials, setFinancials] = useState<SlideFinancials | null>(null);
  const [siblings, setSiblings] = useState<SlideSibling[]>([]);
  const [visionText, setVisionText] = useState<VisionText | null>(null);
  const [allProperties, setAllProperties] = useState<PropertyListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setPropertyId = useCallback((id: number) => {
    setPropertyIdState(id);
    const url = new URL(window.location.href);
    url.searchParams.set("propertyId", String(id));
    window.history.replaceState({}, "", url.toString());
  }, []);

  useEffect(() => {
    fetch("/api/properties", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: PropertyListItem[]) => {
        if (!Array.isArray(data)) return;
        setAllProperties(data);
        if (!propertyId && data.length > 0) {
          const first = data[0];
          setPropertyIdState(first.id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    fetch(`/api/properties/${propertyId}/slides/view`, { credentials: "include" })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: {
        property: SlideProperty;
        photos: SlidePhoto[];
        financials: SlideFinancials;
        siblings: SlideSibling[];
        visionText: VisionText;
      }) => {
        setProperty(data.property);
        setPhotos(data.photos ?? []);
        setFinancials(data.financials);
        setSiblings(data.siblings ?? []);
        setVisionText(data.visionText);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : "Failed to load property data");
        setLoading(false);
      });
  }, [propertyId]);

  return (
    <PropertyContext.Provider value={{
      propertyId,
      setPropertyId,
      property,
      photos,
      financials,
      siblings,
      visionText,
      allProperties,
      loading,
      error,
    }}>
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  return useContext(PropertyContext);
}
