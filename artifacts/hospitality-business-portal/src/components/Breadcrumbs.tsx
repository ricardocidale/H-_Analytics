import { useLocation } from "wouter";
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

function useBreadcrumbs(): BreadcrumbEntry[] {
  const [location] = useLocation();
  const properties = useStore((s) => s.properties);

  const path = location.replace(/\/+$/, "") || "/";

  // Extract property ID from route before any conditional returns (React hooks rule)
  const propertyMatch = path.match(/^\/property\/([^/]+)(\/(.+))?$/);
  const structureMatch = path.match(/^\/structures\/([^/]+)$/);
  const routePropertyId = propertyMatch
    ? parseInt(propertyMatch[1]) || 0
    : structureMatch
    ? parseInt(structureMatch[1]) || 0
    : 0;
  const { data: apiProperty } = useProperty(routePropertyId);

  if (path === "/") {
    return [{ label: "Dashboard" }];
  }

  if (propertyMatch) {
    const propId = propertyMatch[1];
    const sub = propertyMatch[3];
    const storeProp = properties.find((p) => String(p.id) === propId);
    const propName = apiProperty?.name ?? storeProp?.name ?? propId;

    const items: BreadcrumbEntry[] = [
      { label: "Dashboard", href: "/" },
      { label: "Properties", href: "/portfolio" },
    ];

    if (!sub) {
      items.push({ label: propName });
    } else {
      items.push({ label: propName, href: `/property/${propId}` });
      if (sub === "edit") items.push({ label: "Edit" });
      else if (sub === "research") items.push({ label: "Research" });
      else items.push({ label: sub });
    }
    return items;
  }

  if (structureMatch) {
    const propId = structureMatch[1];
    const storeProp = properties.find((p) => String(p.id) === propId);
    const propName = apiProperty?.name ?? storeProp?.name ?? propId;
    return [
      { label: "Dashboard", href: "/" },
      { label: "Properties", href: "/portfolio" },
      { label: propName, href: `/property/${propId}` },
      { label: "Operating Structure" },
    ];
  }

  const staticRoutes: Record<string, BreadcrumbEntry[]> = {
    "/portfolio": [
      { label: "Dashboard", href: "/" },
      { label: "Properties" },
    ],
    "/company": [
      { label: "Dashboard", href: "/" },
      { label: "Management Co" },
    ],
    "/company/assumptions": [
      { label: "Dashboard", href: "/" },
      { label: "Management Co", href: "/company" },
      { label: "Assumptions" },
    ],
    "/company/research": [
      { label: "Dashboard", href: "/" },
      { label: "Management Co", href: "/company" },
      { label: "Research" },
    ],
    "/profile": [
      { label: "Dashboard", href: "/" },
      { label: "My Profile" },
    ],
    "/scenarios": [
      { label: "Dashboard", href: "/" },
      { label: "My Scenarios" },
    ],
    "/sensitivity": [
      { label: "Dashboard", href: "/" },
      { label: "Sensitivity Analysis" },
    ],
    "/financing": [
      { label: "Dashboard", href: "/" },
      { label: "Financing Analysis" },
    ],
    "/property-finder": [
      { label: "Dashboard", href: "/" },
      { label: "Property Finder" },
    ],
    "/methodology": [
      { label: "Dashboard", href: "/" },
      { label: "Help" },
    ],
    "/admin": [
      { label: "Dashboard", href: "/" },
      { label: "Admin Settings" },
    ],
    "/global/research": [
      { label: "Dashboard", href: "/" },
      { label: "Global Research" },
    ],
    "/compare": [
      { label: "Dashboard", href: "/" },
      { label: "Compare Properties" },
    ],
    "/timeline": [
      { label: "Dashboard", href: "/" },
      { label: "Timeline" },
    ],
    "/map": [
      { label: "Dashboard", href: "/" },
      { label: "Map View" },
    ],
    "/help": [
      { label: "Dashboard", href: "/" },
      { label: "Help" },
    ],
    "/research": [
      { label: "Dashboard", href: "/" },
      { label: "Research Center" },
    ],
    "/analysis": [
      { label: "Dashboard", href: "/" },
      { label: "Analysis" },
    ],
    "/voice": [
      { label: "Dashboard", href: "/" },
      { label: "AI Voice Lab" },
    ],
    "/admin/logos": [
      { label: "Dashboard", href: "/" },
      { label: "Admin Settings", href: "/admin" },
      { label: "Logos" },
    ],
  };

  return staticRoutes[path] ?? [
    { label: "Dashboard", href: "/" },
    { label: path.slice(1) },
  ];
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
              ) : (
                <BreadcrumbLink
                  href={item.href}
                  className="text-muted-foreground"
                >
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
