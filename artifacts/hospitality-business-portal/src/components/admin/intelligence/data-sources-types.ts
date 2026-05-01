export type SourceCategory = "apis" | "scrapers" | "sources" | "models";

export interface SourceEntry {
  id: number;
  serviceKey: string;
  name: string;
  sourceType: string;
  trustScore: string | null;
  category: string;
  cadence: string | null;
  lastHealthCheck: string | null;
  lastDataDate: string | null;
  isActive: boolean;
  description: string | null;
  endpoint: string | null;
  apiKeyRef: string | null;
  rateLimitPerMin: number | null;
  successRate: number | null;
  avgLatencyMs: number | null;
  costPerCall: string | null;
  dataProvided: string[] | null;
}

export interface TestResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

export interface CallLogEntry {
  id: number;
  sourceId: number;
  serviceKey: string;
  timestamp: string;
  httpStatus: number | null;
  latencyMs: number | null;
  success: boolean;
  errorMessage: string | null;
}

export const CATEGORY_TABS: { value: SourceCategory; label: string; iconName: string }[] = [
  { value: "apis", label: "APIs", iconName: "IconGlobe" },
  { value: "scrapers", label: "Scrapers", iconName: "IconResearch" },
  { value: "sources", label: "Sources", iconName: "IconActivity" },
  { value: "models", label: "Models", iconName: "IconBrain" },
];

export const CATEGORY_SINGULAR: Record<SourceCategory, string> = {
  apis: "API",
  scrapers: "Scraper",
  sources: "Source",
  models: "Model",
};

export const SOURCE_TYPES: Record<SourceCategory, string[]> = {
  apis: ["api", "rest", "graphql"],
  scrapers: ["scraper", "crawler", "extractor"],
  sources: ["report", "survey", "publication", "database"],
  models: ["llm", "embedding", "vision"],
};

export function getStatus(source: SourceEntry): "healthy" | "degraded" | "error" | "inactive" {
  if (!source.isActive) return "inactive";
  if (source.successRate !== null) {
    if (source.successRate < 80) return "error";
    if (source.successRate < 90) return "degraded";
  }
  return "healthy";
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
