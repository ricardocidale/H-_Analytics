import type { NotificationEventType } from "@shared/schema";

export interface NotificationEvent {
  type: NotificationEventType;
  propertyId?: number;
  propertyName?: string;
  metric?: string;
  currentValue?: number;
  threshold?: number;
  direction?: "above" | "below";
  message?: string;
  link?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export function createEvent(
  type: NotificationEventType,
  data: Omit<NotificationEvent, "type" | "timestamp"> = {}
): NotificationEvent {
  return {
    type,
    timestamp: new Date(),
    ...data,
  };
}

export function getEventLabel(type: NotificationEventType): string {
  const labels: Record<NotificationEventType, string> = {
    DSCR_BREACH: "DSCR Threshold Breach",
    RESEARCH_COMPLETE: "Research Complete",
    REPORT_SHARED: "Report Shared",
    PROPERTY_IMPORTED: "Property Imported",
    CHECKER_FAILURE: "Verification Failure",
    OCCUPANCY_BREACH: "Occupancy Threshold Breach",
    CAP_RATE_BREACH: "Cap Rate Threshold Breach",
    NOI_VARIANCE_BREACH: "NOI Variance Threshold Breach",
    LLM_MODEL_ISSUE: "AI Model Configuration Issue",
    VECTOR_LATENCY_BREACH: "Vector Search Latency Threshold Breach",
    CONSTANTS_REFRESH_FAILED: "Scheduled Constants Refresh Failures",
    CONSTANTS_REFRESH_OVERDUE: "Constants Sources Silent Past Cadence",
    SPECIALIST_QUALITY_BAND_CHANGED: "Specialist Quality Band Change",
    REBECCA_FIXTURE_DRIFTED: "Rebecca Preview Fixture Drift",
    LEGACY_STORAGE_URLS_FOUND: "Legacy Storage URLs Detected in Database",
    SCHEDULER_STALE: "Background Scheduler Stale",
  };
  return labels[type] || type;
}
