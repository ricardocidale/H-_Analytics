/**
 * Breadcrumbs.tsx — Context-aware breadcrumb trail rendered in the app header.
 *
 * Canonical breadcrumb map lives in useBreadcrumbs() below.
 * When adding, removing, or renaming a route, update BOTH:
 *   1. The route table in App.tsx
 *   2. The map in this file (staticRoutes or the dynamic match blocks)
 * See the `breadcrumbs` agent skill for the full update protocol.
 */
import { useLocation, Link } from "wouter";
import { useStore } from "@/lib/store";
import { useProperty } from "@/lib/api";
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

function useBreadcrumbs(): BreadcrumbEntry[] {
  const [location] = useLocation();
  const properties = useStore((s) => s.properties);

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

  // ── Static route map ───────────────────────────────────────────
  // Shorthand ancestor used by Management Co. sub-routes.
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

    // ── Admin ──────────────────────────────────────────────────
    "/admin":                   [HOME, { label: "Admin" }],

    // ── AI Intelligence ────────────────────────────────────────
    "/intelligence":            [HOME, { label: "AI Intelligence" }],

    // ── Slide Decks ────────────────────────────────────────────
    "/lb-slides":               [HOME, { label: "Slide Decks" }],

    // ── Core pages ─────────────────────────────────────────────
    "/profile":                 [HOME, { label: "My Profile" }],
    "/scenarios":               [HOME, { label: "Scenarios" }],
    "/property-finder":         [HOME, { label: "Property Finder" }],
    "/analysis":                [HOME, { label: "Analysis" }],
    "/map":                     [HOME, { label: "Map View" }],
    "/help":                    [HOME, { label: "Help" }],
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
