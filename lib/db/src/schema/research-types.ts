export interface ResearchSourceEntry {
  id: string;
  url: string;
  label: string;
  category?: string;
  addedAt: string;
}

export interface ResearchEventConfig {
  enabled: boolean;
  focusAreas: string[];
  regions: string[];
  timeHorizon: string;
  customInstructions: string;
  customQuestions: string;
  enabledTools: string[];
  refreshIntervalDays?: number;
  sources?: ResearchSourceEntry[];
  customSources?: { name: string; url?: string; category: string }[];
}

export interface AiModelEntry {
  id: string;
  label: string;
  provider: "openai" | "anthropic" | "google" | "xai" | "tesla" | "microsoft" | "meta" | "deepseek";
}

export type LlmMode = "dual" | "primary-only";
export type LlmVendor = "openai" | "anthropic" | "google" | "xai" | "tesla" | "microsoft" | "meta" | "deepseek";

export interface ContextLlmConfig {
  llmVendor?: LlmVendor;
  llmMode?: LlmMode;
  primaryLlm?: string;
  secondaryLlmVendor?: LlmVendor;
  secondaryLlm?: string;
}

export type ResearchDomain = "company" | "property" | "market";

export interface ResearchSourceFile {
  id: string;
  name: string;
  type: "url" | "file";
  url?: string;
  filePath?: string;
  fileSize?: number;
  origin?: "local";
  category: "management-company" | "properties" | "general-marketing";
  addedAt: string;
}

export interface ResearchConfig {
  property?: Partial<ResearchEventConfig>;
  company?:  Partial<ResearchEventConfig>;
  global?:   Partial<ResearchEventConfig>;
  marketing?: Partial<ResearchEventConfig>;
  preferredLlm?: string;
  llmMode?: LlmMode;
  llmVendor?: LlmVendor;
  primaryLlm?: string;
  secondaryLlm?: string;
  customSources?: { name: string; url?: string; category: string }[];
  cachedModels?: AiModelEntry[];
  cachedModelsAt?: string;
  companyLlm?: ContextLlmConfig;
  propertyLlm?: ContextLlmConfig;
  marketLlm?: ContextLlmConfig;
  reportLlm?: ContextLlmConfig;
  chatbotLlm?: ContextLlmConfig;
  premiumExportLlm?: ContextLlmConfig;
  aiUtilityLlm?: ContextLlmConfig;
  graphicsLlm?: ContextLlmConfig;
  tabDefaults?: Record<string, { llmVendor?: LlmVendor; primaryLlm?: string }>;
  companySources?: ResearchSourceEntry[];
  propertySources?: ResearchSourceEntry[];
  marketSources?: ResearchSourceEntry[];
  sourceFiles?: ResearchSourceFile[];
}
