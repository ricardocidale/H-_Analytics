import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;

let initialized = false;

export function initAnalytics() {
  if (!POSTHOG_KEY || initialized) return;
  initialized = true;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
  });
}

export function identifyUser(user: {
  id: number;
  email: string;
  role?: string;
  companyId?: number | null;
}) {
  if (!initialized) return;
  posthog.identify(String(user.id), {
    email: user.email,
    role: user.role,
    companyId: user.companyId,
  });
}

export function resetAnalytics() {
  if (!initialized) return;
  posthog.reset();
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}

export function trackPropertyCreate(propertyId: number, propertyName: string) {
  trackEvent("property_created", { propertyId, propertyName });
}

export function trackPropertyEdit(propertyId: number, section?: string) {
  trackEvent("property_edited", { propertyId, section });
}

export function trackScenarioSave(scenarioId: number, propertyCount: number) {
  trackEvent("scenario_saved", { scenarioId, propertyCount });
}

export function trackScenarioCompare(scenarioIds: number[]) {
  trackEvent("scenario_compared", { scenarioIds, count: scenarioIds.length });
}

export function trackReportExport(format: string, reportType?: string) {
  trackEvent("report_exported", { format, reportType });
}

export function trackResearchGenerated(type: string, propertyId?: number) {
  trackEvent("research_generated", { type, propertyId });
}

export function trackAnalysisRun(analysisType: string, propertyId?: number) {
  trackEvent("analysis_run", { analysisType, propertyId });
}

export function trackUserLogin(role: string) {
  trackEvent("user_logged_in", { role });
}
