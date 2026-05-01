export interface UrlSource {
  id: string;
  url: string;
  label: string;
  addedAt: string;
}

export interface FileSource {
  id: string;
  name: string;
  size: number;
  type: string;
  origin: "local";
  objectPath?: string;
  addedAt: string;
}

export interface IcpSources {
  urls: UrlSource[];
  files: FileSource[];
  allowUnrestricted?: boolean;
}

export interface PromptQuestion {
  id: string;
  question: string;
  sortOrder: number;
}

export interface PromptBuilderConfig {
  questions: PromptQuestion[];
  additionalInstructions: string;
  context: {
    location: boolean;
    propertyProfile: boolean;
    propertyDescription: boolean;
    questions: boolean;
    additionalInstructions: boolean;
    financialResults: boolean;
  };
}

export interface ResearchSection {
  title: string;
  locationKey?: string;
  content: string;
}

export interface IcpResearchReport {
  generatedAt: string;
  model: string;
  sections: ResearchSection[];
  extractedMetrics: Record<string, any>;
}

export const DEFAULT_PROMPT_BUILDER: PromptBuilderConfig = {
  questions: [],
  additionalInstructions: "",
  context: {
    location: true,
    propertyProfile: true,
    propertyDescription: true,
    questions: true,
    additionalInstructions: true,
    financialResults: false,
  },
};

export const DEFAULT_ICP_MGMT_QUESTIONS: PromptQuestion[] = [
  {
    id: "default-mkt",
    question: "What are the Industry Benchmark Ranges (min–max %) for Marketing fees charged by hotel management companies as a percentage of Total Revenue? The app default is 2.0% of Total Revenue for Marketing. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (property size, market tier, brand strength, service model), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).",
    sortOrder: 0,
  },
  {
    id: "default-techres",
    question: "What are the Industry Benchmark Ranges (min–max %) for Technology & Reservations fees charged by hotel management companies as a percentage of Total Revenue? The app default is 2.0% of Total Revenue for Technology & Reservations. This category covers IT systems (PMS, booking engine, Wi-Fi, cybersecurity), central reservations (CRS, call center, group bookings), and channel distribution. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (property size, market tier, brand strength, service model), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).",
    sortOrder: 1,
  },
  {
    id: "default-acct",
    question: "What are the Industry Benchmark Ranges (min–max %) for Accounting fees charged by hotel management companies as a percentage of Total Revenue? The app default is 1.5% of Total Revenue for Accounting. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (property size, market tier, brand strength, service model), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).",
    sortOrder: 2,
  },
  {
    id: "default-revmgmt",
    question: "What are the Industry Benchmark Ranges (min–max %) for Revenue Management fees charged by hotel management companies as a percentage of Total Revenue? The app default is 1.0% of Total Revenue for Revenue Management. This category covers dynamic pricing, yield management, demand forecasting, competitive set analysis, and RevPAR optimization. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (property size, market tier, revenue complexity, service model), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).",
    sortOrder: 3,
  },
  {
    id: "default-gm",
    question: "What are the Industry Benchmark Ranges (min–max %) for General Management fees charged by hotel management companies as a percentage of Total Revenue? The app default is 1.5% of Total Revenue for General Management. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (property size, market tier, brand strength, service model), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).",
    sortOrder: 4,
  },
  {
    id: "default-procurement",
    question: "What are the Industry Benchmark Ranges (min–max %) for Procurement fees charged by hotel management companies as a percentage of Total Revenue? The app default is 1.0% of Total Revenue for Procurement. This category covers centralized purchasing, vendor negotiation, supply chain management, GPO coordination, and cost optimization. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (portfolio size, purchasing volume, vendor relationships, service model), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).",
    sortOrder: 5,
  },
  {
    id: "default-basefee",
    question: "What are the Industry Benchmark Ranges (min–max %) for the overall Base Management Fee charged by hotel management companies as a percentage of Total Revenue? The app default is 8.5% of Total Revenue. This fee represents the aggregate compensation for day-to-day hotel operations and is the sum of all service category fees. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the base management fee is calculated in the USALI waterfall, identify factors that influence where a specific property or management company falls within the range (property size, market tier, brand strength, full-service vs. limited-service, chain scale), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).",
    sortOrder: 8,
  },
  {
    id: "default-incentive",
    question: "What are the Industry Benchmark Ranges (min–max %) for the Incentive Management Fee charged by hotel management companies as a percentage of Gross Operating Profit (GOP)? The app default is 12% of GOP. Please explain how GOP is calculated (Total Revenue minus Total Operating Expenses per USALI), describe the typical GOP hurdle or owner's priority return that must be met before the incentive fee is triggered, provide the benchmark range (low–high %), identify factors that influence where a specific property or company falls within the range (property performance, owner negotiation leverage, management company track record, market conditions), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).",
    sortOrder: 9,
  },
  {
    id: "default-markup",
    question: "What are the Industry Benchmark Ranges (min–max %) for the centralized service markup (cost-plus pass-through) applied by hotel management companies on services they procure on behalf of properties? The app default is a 20% markup. Please explain the cost-plus pass-through model (management company procures a service externally and passes the cost through to the property with a markup), provide the benchmark range (low–high %), identify factors that influence where a specific markup falls within the range (volume discounts, service type, management company scale, competitive landscape), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).",
    sortOrder: 10,
  },
];

export const DEFAULT_URL_SEEDS: UrlSource[] = [
  { id: "default-str", url: "https://str.com", label: "STR", addedAt: new Date().toISOString() },
  { id: "default-cbre", url: "https://www.cbre.com/industries/hotels", label: "CBRE Hotels", addedAt: new Date().toISOString() },
  { id: "default-hvs", url: "https://hvs.com", label: "HVS", addedAt: new Date().toISOString() },
  { id: "default-jll", url: "https://www.jll.com/en/industries/hotels-and-hospitality", label: "JLL Hotels", addedAt: new Date().toISOString() },
  { id: "default-hnn", url: "https://hotelnewsnow.com", label: "Hotel News Now", addedAt: new Date().toISOString() },
  { id: "default-hnet", url: "https://www.hospitalitynet.org", label: "Hospitality Net", addedAt: new Date().toISOString() },
  { id: "default-pkf", url: "https://www.pkfhotels.com", label: "PKF", addedAt: new Date().toISOString() },
  { id: "default-fred", url: "https://fred.stlouisfed.org", label: "FRED", addedAt: new Date().toISOString() },
  { id: "default-ahla", url: "https://www.ahla.com", label: "AHLA", addedAt: new Date().toISOString() },
  { id: "default-lodging", url: "https://lodgingmagazine.com", label: "Lodging Magazine", addedAt: new Date().toISOString() },
];

export const DEFAULT_SOURCES: IcpSources = { urls: [], files: [] };
