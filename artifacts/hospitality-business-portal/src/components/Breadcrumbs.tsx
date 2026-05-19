/**
 * Breadcrumbs.tsx — Context-aware breadcrumb trail rendered in the app header.
 *
 * Canonical breadcrumb map lives in useBreadcrumbs() below.
 * When adding, removing, or renaming a route, update BOTH:
 *   1. The route table in App.tsx
 *   2. The map in this file (staticRoutes or the dynamic match blocks)
 *
 * Intelligence sections (/intelligence?section=X) are resolved via
 * useIntelligenceSection() so the breadcrumb updates without a full navigation.
 *
 * Admin sections (/admin#sectionName) are resolved via useAdminSection() for
 * the same reason.
 */
import { useLocation, Link } from "wouter";
import { useStore } from "@/lib/store";
import { useProperty } from "@/lib/api";
import { useAdminSection } from "@/lib/admin-nav";
import { useIntelligenceSection } from "@/lib/intelligence-nav";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface BreadcrumbEntry {
  label: string;
  href?: string;
}

const HOME: BreadcrumbEntry = { label: "Dashboard", href: "/" };
const ADMIN: BreadcrumbEntry = { label: "Admin", href: "/admin" };
const AI_INTEL: BreadcrumbEntry = { label: "AI Intelligence", href: "/intelligence" };

// ── Intelligence section label map ──────────────────────────────────────────
// Derived from buildNavGroups() in IntelligenceSidebar.tsx.
// Keep in sync when sections are added or renamed.
const INTEL_SECTION_LABEL: Record<string, string> = {
  // Agent Roster
  "roster-agents":        "Agents",
  "roster-specialists":   "Specialists",
  "roster-minions":       "Minions",
  // Conversational
  "ai-agents":            "Rebecca",
  "knowledge-base":       "Knowledge Base",
  "conversations":        "Conversations",
  "iris":                 "Iris",
  // Logs
  "logs":                 "All Logs",
  "runs":                 "All Logs",        // legacy alias
  // Knowledge & Data / Resources
  "knowledge-registry":              "Knowledge Registry",
  "knowledge-registry-country-data": "Country Economic Data",
  "resources":                        "Resources Catalog",
  "resources-tables":                 "Market Data",
  "benchmark-bands":                  "Benchmark Bands",
  "animations":                       "Animations",
  // LLMs
  "llms-agents":    "LLMs · Agents",
  "llms-research":  "LLMs · Research",
  "llms-graphics":  "LLMs · Graphics",
  "llms-other":     "LLMs · Other",
  "llm-workflows":  "LLMs · Agents",        // legacy alias
  // System
  "assumption-guidance": "Assumption Guidance",
  "engine-health":       "System Health",
  "scheduled-research":  "Scheduled Research",
  "vector-bench":        "Vector Search Latency",
  // Orchestrator / legacy specialist detail pages
  "analyst-orchestrator": "Gustavo",
  "gustavo":              "Gustavo",
  "specialists":          "Specialists",
};

// ── Admin section label map ──────────────────────────────────────────────────
// Derived from buildAdminGroups() in AdminSidebar.tsx.
const ADMIN_SECTION_LABEL: Record<string, string> = {
  // Model Defaults
  "defaults-management-company": "Management Co.",
  "defaults-property":           "Property Defaults",
  "constants":                   "Constants",
  "analyst-tables":              "Analyst Tables",
  "reference-ranges":            "Reference Ranges",
  // Portfolio
  "property-heroes":     "Property Heroes",
  "archived-properties": "Archived Properties",
  "scenarios":           "All Scenarios",
  "default-assignments": "Default Assignments",
  // Users
  "users": "All Users",
  // Quality & Audit
  "required-fields": "Required Fields",
  "verification":    "Verification",
  "qa-sandbox":      "QA Sandbox",
  "compliance":      "Compliance",
  // Preferences
  "notifications":      "Notifications",
  "sidebar-visibility": "Sidebar Visibility",
  "brand-themes":       "Themes",
  "brand-assets-page":  "Brand Assets",
  // System
  "database":       "Database",
  "observability":  "Monitoring",
  "activity":       "Audit Log",
  "login-settings": "Authentication",
};

function useBreadcrumbs(): BreadcrumbEntry[] {
  const [location] = useLocation();
  const properties = useStore((s) => s.properties);
  const [adminSection] = useAdminSection();
  const [intelSection] = useIntelligenceSection();

  const path = location.replace(/\/+$/, "") || "/";

  // ── Dynamic: /property/:id[/:sub] ──────────────────────────────
  const propertyMatch = path.match(/^\/property\/([^/]+)(?:\/(.+))?$/);
  // ── Dynamic: /structures[/:id] ─────────────────────────────────
  const structuresMatch = path.match(/^\/structures(?:\/([^/]+))?$/);

  const routePropertyId = propertyMatch
    ? parseInt(propertyMatch[1]) || 0
    : structuresMatch?.[1]
    ? parseInt(structuresMatch[1]) || 0
    : 0;

  const { data: apiProperty } = useProperty(routePropertyId);

  // ── Dashboard ──────────────────────────────────────────────────
  if (path === "/") return [{ label: "Dashboard" }];

  // ── Property routes ────────────────────────────────────────────
  if (propertyMatch) {
    const propId = propertyMatch[1];
    const sub = propertyMatch[2];
    const storeProp = properties.find((p) => String(p.id) === propId);
    const propName = apiProperty?.name ?? storeProp?.name ?? propId;

    const base: BreadcrumbEntry[] = [
      HOME,
      { label: "Properties", href: "/portfolio" },
    ];

    const SUB_LABELS: Record<string, string> = {
      edit:     "Property Assumptions",
      research: "Research",
      photos:   "Photos",
      criteria: "Research Criteria",
    };

    if (!sub) {
      return [...base, { label: propName }];
    }
    return [
      ...base,
      { label: propName, href: `/property/${propId}` },
      { label: SUB_LABELS[sub] ?? sub },
    ];
  }

  // ── Structures (Operating Structure Comparison) ────────────────
  if (structuresMatch) {
    const propId = structuresMatch[1];
    if (propId) {
      const storeProp = properties.find((p) => String(p.id) === propId);
      const propName = apiProperty?.name ?? storeProp?.name ?? propId;
      return [
        HOME,
        { label: "Properties", href: "/portfolio" },
        { label: propName, href: `/property/${propId}` },
        { label: "Operating Structure" },
      ];
    }
    return [HOME, { label: "Operating Structure" }];
  }

  // ── Intelligence section (section-aware) ───────────────────────
  if (path === "/intelligence" || path === "/ai-intelligence") {
    const sectionLabel = INTEL_SECTION_LABEL[intelSection];
    if (sectionLabel) {
      return [HOME, ADMIN, AI_INTEL, { label: sectionLabel }];
    }
    // Specialist detail pages — section ID looks like "specialist-mgmt-co-*"
    if (intelSection.startsWith("specialist-")) {
      return [HOME, ADMIN, AI_INTEL, { label: "Specialist" }];
    }
    return [HOME, ADMIN, { label: "AI Intelligence" }];
  }

  // ── Admin section (section-aware) ──────────────────────────────
  if (path === "/admin") {
    const sectionLabel = ADMIN_SECTION_LABEL[adminSection];
    if (sectionLabel) {
      return [HOME, { label: "Admin", href: "/admin" }, { label: sectionLabel }];
    }
    return [HOME, { label: "Admin" }];
  }

  // ── Static route map ───────────────────────────────────────────
  const MGMT: BreadcrumbEntry = { label: "Management Co.", href: "/company" };

  const staticRoutes: Record<string, BreadcrumbEntry[]> = {
    // ── Portfolio ──────────────────────────────────────────────
    "/portfolio":               [HOME, { label: "Properties" }],

    // ── Management Co. ─────────────────────────────────────────
    "/company":                 [HOME, { label: "Management Co." }],
    "/company/assumptions":     [HOME, MGMT, { label: "Assumptions" }],
    "/company/research":        [HOME, MGMT, { label: "Research" }],
    "/company/guidance":        [HOME, MGMT, { label: "Guidance" }],
    "/company/icp-definition":  [HOME, MGMT, { label: "ICP Bracket Mix" }],
    "/company/criteria":        [HOME, MGMT, { label: "Criteria" }],

    // ── Admin sub-pages ────────────────────────────────────────
    "/admin/logos":             [HOME, ADMIN, { label: "Logos" }],
    "/admin/icp-studio":        [HOME, ADMIN, { label: "ICP Studio" }],
    "/admin/lb-slides":         [HOME, ADMIN, { label: "Slides" }],

    // ── Slide Decks ────────────────────────────────────────────
    "/lb-slides":               [HOME, { label: "Slide Decks" }],
    "/slide-decks":             [HOME, { label: "Slide Decks" }],

    // ── Analysis tools ─────────────────────────────────────────
    "/analysis":                [HOME, { label: "Analysis" }],
    "/sensitivity":             [HOME, { label: "Sensitivity" }],
    "/financing":               [HOME, { label: "Financing" }],
    "/executive-summary":       [HOME, { label: "Executive Summary" }],
    "/compare":                 [HOME, { label: "Compare" }],
    "/timeline":                [HOME, { label: "Timeline" }],

    // ── Core pages ─────────────────────────────────────────────
    "/profile":                 [HOME, { label: "My Profile" }],
    "/scenarios":               [HOME, { label: "Scenarios" }],
    "/property-finder":         [HOME, { label: "Property Finder" }],
    "/map":                     [HOME, { label: "Map View" }],
    "/help":                    [HOME, { label: "Help" }],
    "/settings":                [HOME, { label: "Settings" }],
    "/methodology":             [HOME, { label: "Methodology" }],
    "/research":                [HOME, { label: "Research" }],
    "/global/research":         [HOME, { label: "Research" }],
    "/icp":                     [HOME, { label: "ICP" }],
  };

  return staticRoutes[path] ?? [HOME, { label: path.slice(1) }];
}

export default function Breadcrumbs() {
  const items = useBreadcrumbs();

  return (
    <Breadcrumb data-testid="breadcrumbs" className="text-sm px-0">
      <BreadcrumbList>
        {items.flatMap((item, i) => {
          const isLast = i === items.length - 1;
          const elements = [];
          if (i > 0) {
            elements.push(<BreadcrumbSeparator key={`sep-${i}`} />);
          }
          elements.push(
            <BreadcrumbItem key={`item-${i}`}>
              {isLast ? (
                <BreadcrumbPage className="text-foreground">
                  {item.label}
                </BreadcrumbPage>
              ) : item.href ? (
                <BreadcrumbLink asChild className="text-muted-foreground">
                  <Link href={item.href}>{item.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbLink className="text-muted-foreground cursor-default">
                  {item.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          );
          return elements;
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
