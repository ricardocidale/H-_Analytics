import { useMemo, useState, useCallback, useEffect, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type AdminSection, resolveSection, SECTION_REDIRECTS, SPECIALIST_SECTION_TO_ID, type SpecialistSection } from "@/components/admin/AdminSidebar";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconAlertTriangle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { useAdminSection, useAdminSectionFromHash } from "@/lib/admin-nav";
import type { AdminSaveState } from "@/components/admin/save-state";
import { Loader2 } from "@/components/icons/themed-icons";
import { buildSpecialistTitle } from "@/components/specialists";

interface SpecialistListItem {
  id: string;
  humanName?: string | null;
}

function isSpecialistSection(s: AdminSection): s is SpecialistSection {
  return s in SPECIALIST_SECTION_TO_ID;
}

const ActivityTab = lazy(() => import("@/components/admin").then(m => ({ default: m.ActivityTab })));
const VerificationTab = lazy(() => import("@/components/admin").then(m => ({ default: m.VerificationTab })));
const DatabaseTab = lazy(() => import("@/components/admin").then(m => ({ default: m.DatabaseTab })));
const UsersTab = lazy(() => import("@/components/admin/UsersTab"));
const SidebarVisibilityTab = lazy(() => import("@/components/admin/SidebarVisibilityTab"));
const AIAgentsTab = lazy(() => import("@/components/admin/AIAgentsTab"));
const NotificationsTab = lazy(() => import("@/components/admin/NotificationsTab"));
const ModelDefaultsTab = lazy(() => import("@/components/admin/ModelDefaultsTab"));
const ScenariosTab = lazy(() => import("@/components/admin/ScenariosTab"));
const QASandbox = lazy(() => import("@/components/admin/intelligence/QASandbox"));
const ScheduledResearchPanel = lazy(() => import("@/components/admin/intelligence/ScheduledResearchPanel"));
const BrandTab = lazy(() => import("@/components/admin/BrandTab"));
const PropertyHeroImagesTab = lazy(() => import("@/components/admin/PropertyHeroImagesTab"));
const EngineDashboard = lazy(() => import("@/components/admin/intelligence/EngineDashboard"));
const DataSourcesTab = lazy(() => import("@/components/admin/intelligence/DataSourcesTab"));
const PipelineConfigTab = lazy(() => import("@/components/admin/intelligence/PipelineConfigTab"));
// KnowledgeBaseTab is now rendered as a sub-tab inside AIAgentsTab/RebeccaAdminTabs
const HospitalityBenchmarksTab = lazy(() => import("@/components/admin/intelligence/HospitalityBenchmarksTab"));
const AnalystTablesTab = lazy(() => import("@/components/admin/intelligence/AnalystTables"));
const ReferenceRangesTab = lazy(() => import("@/components/admin/intelligence/ReferenceRangesTab"));
const VectorBenchTrendsTab = lazy(() => import("@/components/admin/intelligence/VectorBenchTrendsTab"));
const SpecialistPage = lazy(() => import("@/pages/admin/specialist/SpecialistPage"));
const RequiredFieldsRollup = lazy(() => import("@/components/admin/required-fields/RequiredFieldsRollup"));
const ObservabilityTab = lazy(() => import("@/components/admin/ObservabilityTab"));
const ComplianceTab = lazy(() => import("@/components/admin/ComplianceTab"));

export type { AdminSaveState };

const sectionMeta: Partial<Record<AdminSection, { title: string; subtitle: string }>> = {
  "model-defaults":      { title: "App Defaults",           subtitle: "Financial defaults and seed values for new entities" },
  users:                 { title: "Users",                   subtitle: "Manage user accounts and assignments" },
  activity:              { title: "Activity",                subtitle: "Login logs, audit trail, and session monitoring" },
  scenarios:             { title: "Scenarios",                subtitle: "Manage all scenarios, ownership, and access grants" },
  brand:                 { title: "Brand",                    subtitle: "Logos, themes, and icon customization" },
  "ai-agents":           { title: "Rebecca Configuration",   subtitle: "System prompt, personality, and configuration for your AI assistant" },
  "engine-dashboard":    { title: "Research Dashboard",       subtitle: "Coverage, freshness, costs, and system health" },
  "data-sources":        { title: "Data Sources",             subtitle: "APIs, scrapers, sources, and AI models powering intelligence" },
  "pipeline-config":     { title: "Pipeline Config",          subtitle: "Staleness thresholds, token budgets, model routing, and refresh schedules" },
  "qa-sandbox":          { title: "QA Sandbox",               subtitle: "Preview context packs and prompts before running research" },
  "scheduled-research":  { title: "Scheduled Research",       subtitle: "Automated research workflows that keep intelligence fresh" },
  benchmarks:            { title: "Hospitality Benchmarks",    subtitle: "Industry benchmark values powering AI research ranges" },
  "analyst-tables":      { title: "Analyst Tables",             subtitle: "Admin-only LLM refresh of benchmark tables (capital raise, etc.)" },
  "reference-ranges":    { title: "Reference Ranges",           subtitle: "Admin-editable low / mid / high ranges (tax, macro, KPI, construction, financing, labor, risk, demand) consumed by Specialists, Analyst, and Rebecca" },
  "vector-bench":        { title: "Vector Search Latency",      subtitle: "Trend lines for pgvector / HNSW p50 and p95 query latency over time" },
  notifications:         { title: "Notifications",            subtitle: "Email channels, alert rules, and delivery tracking" },
  "sidebar-visibility":  { title: "Sidebar Visibility",        subtitle: "Control which sidebar pages are visible to users in the main app (does not affect the admin sidebar)" },
  verification:          { title: "Verification",             subtitle: "Independent GAAP financial audit and compliance" },
  database:              { title: "Database",                  subtitle: "Entity monitoring, seed data, and canonical sync" },
  observability:         { title: "Observability",             subtitle: "Background scheduler health, last-cycle summaries, and stale-warnings" },
  compliance:            { title: "Compliance",               subtitle: "Vito compliance audit findings: constants taxonomy, admin_resources parity, and KB coverage gaps" },
  "property-heroes":     { title: "Property Heroes",           subtitle: "View and download hero images for all properties, individually or as a ZIP" },

  // AI Research → Specialists (P5). The page header *title* for these
  // sections is computed dynamically from the catalog + the live
  // `/api/admin/specialists` rename overrides via `specialistMeta()` below
  // so it reads persona-first (e.g. "Ana · Funding Intelligence") per
  // `.agents/skills/specialist-persona-naming/SKILL.md`. Only the operator-
  // focused subtitle copy lives here; see `SPECIALIST_SUBTITLES` below.

  // Legacy URL aliases — page header reuses the canonical section's title.
  // Kept only for plausibly-bookmarked deep links per
  // docs/audits/admin-section-audit-2026-04-20.md §MT.1.
  logos:                 { title: "Brand",                    subtitle: "Logos, themes, and icon customization" },
  themes:                { title: "Brand",                    subtitle: "Logos, themes, and icon customization" },
  llms:                  { title: "Data Sources",             subtitle: "APIs, scrapers, sources, and AI models" },
  sources:               { title: "Data Sources",             subtitle: "APIs, scrapers, sources, and AI models" },
  "required-fields":     { title: "Required Fields",          subtitle: "Read-only roll-up across every Specialist's required fields and prerequisites. Edit on the owning Specialist's Required Fields tab." },
  "default-assignments": { title: "Default Assignments",      subtitle: "Assign default scenarios per user with property toggles" },
  // Defaults section (Model Defaults navigation)
  "defaults-management-company": { title: "Management Company Defaults", subtitle: "Default financial parameters seeded into new entities at the management-company level" },
  "defaults-property":           { title: "Property Defaults",            subtitle: "Default revenue, cost, and capital assumptions seeded into new properties" },
  "defaults-market-macro":       { title: "Market & Macro Defaults",      subtitle: "Macro and market-condition defaults applied to new entities" },
  "constants":                   { title: "Constants",                    subtitle: "Immutable model constants used across the application" },
  "defaults-mgmt-co-fees":       { title: "Management Co Fees",           subtitle: "Tier A management and incentive fee rates applied as defaults to all managed properties" },
  "defaults-brands":             { title: "Brand Fee Stacks",             subtitle: "Per-flag brand fee rates (royalty, marketing, loyalty, reservation, tech) for each H+ brand flag" },
};

/**
 * Operator-focused subtitle copy for the Specialist admin sections. The
 * *title* is computed dynamically by `specialistMeta()` so it leads with
 * the persona name (e.g. "Ana · Funding Intelligence"); only the
 * subtitle, which describes what the *admin operator* can do on this
 * page (assignment + health surface, what the Specialist owns, etc.), is
 * worth pinning in marketing copy here. Keep this list in sync with
 * `SPECIALIST_SECTION_TO_ID` in `AdminSidebar.tsx`.
 */
const SPECIALIST_SUBTITLES: Record<SpecialistSection, string> = {
  "specialist-mgmt-co-funding":            "Read-only assignment + health surface for the mgmt-co Funding Specialist.",
  "specialist-mgmt-co-revenue":            "Read-only assignment + health surface for the mgmt-co Revenue Specialist.",
  "specialist-mgmt-co-compensation":       "Read-only assignment + health surface for the mgmt-co Compensation Specialist.",
  "specialist-mgmt-co-overhead":           "Read-only assignment + health surface for the mgmt-co Overhead Specialist.",
  "specialist-mgmt-co-company":            "Read-only assignment + health surface for the mgmt-co Company Specialist.",
  "specialist-mgmt-co-property-defaults":  "Read-only assignment + health surface for the mgmt-co Property Defaults Specialist.",
  "specialist-mgmt-co-icp-intelligence":   "Read-only assignment + health surface (evaluator pending).",
  "specialist-property-risk-intelligence": "Read-only assignment + health surface (evaluator pending).",
  "specialist-property-executive-summary": "Read-only assignment + health surface (evaluator pending).",
  "specialist-photos-photo-enhancer":      "Read-only assignment + health surface (evaluator pending).",
  "specialist-portfolio-ops-watchdog":     "Read-only assignment + health surface (evaluator pending).",
  "specialist-portfolio-capital-raise":    "Read-only assignment + health surface for the Portfolio Capital Raise Specialist.",
  "specialist-resources-builder":          "Read-only assignment + health surface for the Resources Builder Specialist.",
  "specialist-constants-tax-research":         "Owns tax-rate, capital-gains, and property-tax constants. Authority-sourced; refresh per row.",
  "specialist-constants-macro-research":       "Owns inflation and country risk premium. Sourced from central banks and IMF.",
  "specialist-constants-depreciation-research":"Owns building depreciation useful-life by country (IRS Pub. 946, CRA, CGI, etc.).",
  "specialist-constants-reporting-research":   "Owns universal conventions (USALI/AHLA) such as days-per-month.",
};

/**
 * Persona-first page header for an admin Specialist section. Delegates
 * the title assembly to the shared `buildSpecialistTitle()` helper in
 * `@/components/specialists` so the Admin page header, the Intelligence
 * page header, the Intelligence sidebar's `specialistRow`, and the `<SpecialistName />`
 * component can never drift on what name to lead with. See
 * `.agents/skills/specialist-persona-naming/SKILL.md` for the rule.
 *
 * `humanNameById` carries the live override pulled from
 * `/api/admin/specialists` so an Identity-tab rename reflects on the
 * page header without a reload (the Identity tab already invalidates
 * that query on save). Falls back to the catalog `humanName` while the
 * query is in flight, then to just the role label if neither is set.
 *
 * The fallback role passed to `buildSpecialistTitle` is the raw section
 * slug — when an unknown specialist id sneaks in, we'd rather show the
 * URL-shaped slug than the placeholder id the resolver returns.
 */
function specialistMeta(
  section: SpecialistSection,
  humanNameById: Map<string, string>,
): { title: string; subtitle: string } {
  const id = SPECIALIST_SECTION_TO_ID[section];
  return {
    title: buildSpecialistTitle(id, humanNameById, section),
    subtitle: SPECIALIST_SUBTITLES[section] ?? "",
  };
}

/**
 * Predicate used by `useAdminSectionFromHash` (task #773) to decide whether
 * a `#<segment>/...` URL hash names an admin section worth switching to.
 * Specialist sections live in `SPECIALIST_SECTION_TO_ID` (their titles are
 * resolved dynamically rather than via `sectionMeta`), so we accept either
 * source. Module-scope so the hook's effect deps stay stable across renders.
 */
function isKnownAdminSection(segment: string): boolean {
  return segment in sectionMeta || segment in SPECIALIST_SECTION_TO_ID;
}

/** Map sidebar alias → ModelDefaultsTab internal sub-tab value */
const MODEL_DEFAULTS_SUB_TAB: Partial<Record<AdminSection, string>> = {
  "model-defaults":      "company",
  // Defaults section
  "defaults-management-company": "company",
  "defaults-property":           "property-underwriting",
  "defaults-market-macro":       "market-macro",
  "constants":                   "model-constants",
  "defaults-mgmt-co-fees":       "management-co-fees",
  "defaults-brands":             "brands",
};

/**
 * Map sidebar alias → set of ModelDefaultsTab sub-tabs that should be visible
 * when entering via that alias. When undefined, all tabs are shown (legacy
 * behavior). Each Defaults menu item shows only the tabs relevant to it,
 * so e.g. the Property page never surfaces Management Company defaults.
 */
const MODEL_DEFAULTS_VISIBLE_TABS: Partial<Record<AdminSection, readonly string[]>> = {
  "defaults-management-company": ["company", "capital-stack-discipline"],
  "defaults-property":           ["property-underwriting"],
  "defaults-market-macro":       ["market-macro"],
  "constants":                   ["model-constants", "dd-template"],
  "defaults-mgmt-co-fees":       ["management-co-fees"],
  "defaults-brands":             ["brands"],
};

const REBECCA_SUB_TAB: Partial<Record<AdminSection, string>> = {
  "ai-agents":       "configuration",
};

/**
 * Walk the SECTION_REDIRECTS chain starting at `section` and return the first
 * value found in `map`. Lets us look up sub-tab / visible-tab config by an
 * alias (e.g. `services-fees`) and have it resolve to the entry registered
 * under the canonical Steady-State section it redirects to.
 */
function lookupAlongChain<T>(section: AdminSection, map: Partial<Record<AdminSection, T>>): T | undefined {
  let current: AdminSection | undefined = section;
  const seen = new Set<AdminSection>();
  while (current && !seen.has(current)) {
    const value = map[current];
    if (value !== undefined) return value;
    seen.add(current);
    current = SECTION_REDIRECTS[current];
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SectionContent({ section, onNavigate, onSaveStateChange }: { section: AdminSection; onNavigate: (s: AdminSection) => void; onSaveStateChange: (state: AdminSaveState | null) => void }) {
  const resolved = resolveSection(section);

  switch (resolved) {
    case "model-defaults":   return <ModelDefaultsTab onSaveStateChange={onSaveStateChange} initialTab={lookupAlongChain(section, MODEL_DEFAULTS_SUB_TAB)} visibleTabs={lookupAlongChain(section, MODEL_DEFAULTS_VISIBLE_TABS)} />;
    case "required-fields":  return <RequiredFieldsRollup />;
    case "users":            return <UsersTab />;
    case "activity":         return <ActivityTab />;
    case "scenarios":        return <ScenariosTab />;
    case "brand":            return <BrandTab />;
    case "ai-agents":        return (
      <ErrorBoundary fallback={
        <div className="mt-6 p-8 flex flex-col items-center gap-4 text-center rounded-xl border border-accent-pop/20 bg-accent-pop/10">
          <IconAlertTriangle className="w-10 h-10 text-accent-pop" />
          <div>
            <p className="font-semibold text-foreground">AI configuration failed to load</p>
            <p className="text-sm text-muted-foreground mt-1">A component error occurred. Reload the page to try again.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      }><AIAgentsTab onSaveStateChange={onSaveStateChange} initialTab={REBECCA_SUB_TAB[section]} /></ErrorBoundary>
    );
    case "engine-dashboard": return <EngineDashboard />;
    case "data-sources":     return <DataSourcesTab />;
    case "pipeline-config":  return <PipelineConfigTab onSaveStateChange={onSaveStateChange} />;
    case "qa-sandbox":       return <QASandbox />;
    case "scheduled-research": return <ScheduledResearchPanel />;
    case "benchmarks":       return <HospitalityBenchmarksTab />;
    case "analyst-tables":   return <AnalystTablesTab />;
    case "reference-ranges": return <ReferenceRangesTab />;
    case "vector-bench":     return <VectorBenchTrendsTab />;
    case "notifications":    return <NotificationsTab />;
    case "sidebar-visibility": return <SidebarVisibilityTab />;
    case "verification":     return <VerificationTab />;
    case "database":         return <DatabaseTab />;
    case "property-heroes":  return <PropertyHeroImagesTab />;
    case "observability":    return <ObservabilityTab />;
    case "compliance":       return <ComplianceTab />;
    default: {
      if (isSpecialistSection(section)) {
        return <SpecialistPage specialistId={SPECIALIST_SECTION_TO_ID[section]} />;
      }
      return null;
    }
  }
}

export default function Admin() {
  const [activeSection, setActiveSection] = useAdminSection();
  const [saveState, setSaveState] = useState<AdminSaveState | null>(null);

  // URL hash → admin section sync (task #773). See
  // `useAdminSectionFromHash` in `client/src/lib/admin-nav.ts` for the full
  // rationale. The predicate scopes the sync to sections the Admin shell
  // actually renders so a stray anchor-style hash can't replace the active
  // section with garbage.
  useAdminSectionFromHash(isKnownAdminSection);

  useEffect(() => {
    setSaveState(null);
  }, [activeSection]);

  const handleSaveStateChange = useCallback((state: AdminSaveState | null) => {
    setSaveState(state);
  }, []);

  // Pull the live Specialist list so the page header for any Specialist
  // section tracks an Identity-tab rename (including a future Gustavo
  // override) without a reload. The IdentityTab already invalidates this
  // query on save, so the header refreshes the moment the override is
  // persisted. Falls back to the catalog `humanName` while the query is in
  // flight or if the request fails. Mirrors the same hook in
  // `client/src/pages/Intelligence.tsx`.
  const { data: specialists } = useQuery<SpecialistListItem[]>({
    queryKey: ["/api/admin/specialists"],
  });
  const humanNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of specialists ?? []) {
      const trimmed = s.humanName?.trim();
      if (trimmed) m.set(s.id, trimmed);
    }
    return m;
  }, [specialists]);

  const resolved = resolveSection(activeSection);
  const meta = isSpecialistSection(activeSection)
    ? specialistMeta(activeSection, humanNameById)
    : lookupAlongChain(activeSection, sectionMeta) ?? sectionMeta[resolved] ?? { title: "Admin", subtitle: "" };

  return (
    <AnimatedPage>
    <TooltipProvider>
      <Layout>
        <div className="space-y-5">
          <PageHeader
            title={meta.title}
            subtitle={meta.subtitle}
            variant="dark"
            actions={
              saveState ? (
                <SaveButton
                  onClick={saveState.onSave}
                  hasChanges={saveState.isDirty}
                  isPending={saveState.isPending}
                  alwaysActive={saveState.requiresEndorsement}
                  size="sm"
                  data-testid="button-admin-save"
                />
              ) : undefined
            }
          />

          <div className="space-y-6" data-testid={`admin-content-${resolved}`}>
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-accent-pop" /></div>}>
              <SectionContent section={activeSection} onNavigate={setActiveSection} onSaveStateChange={handleSaveStateChange} />
            </Suspense>
          </div>
        </div>
      </Layout>
    </TooltipProvider>
    </AnimatedPage>
  );
}
