import { Suspense, lazy, useMemo } from "react";
import type { UserManualSection } from "./constants";

const sectionMap: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  "getting-started": lazy(() => import("./sections/Section01GettingStarted")),
  "navigation": lazy(() => import("./sections/Section02Navigation")),
  "dashboard": lazy(() => import("./sections/Section03Dashboard")),
  "properties": lazy(() => import("./sections/Section04Properties")),
  "property-details": lazy(() => import("./sections/Section05PropertyDetails")),
  "property-images": lazy(() => import("./sections/Section06PropertyImages")),
  "management-company": lazy(() => import("./sections/Section07ManagementCompany")),
  "assumptions": lazy(() => import("./sections/Section08Assumptions")),
  "scenarios": lazy(() => import("./sections/Section09Scenarios")),
  "analysis": lazy(() => import("./sections/Section10Analysis")),
  "property-finder": lazy(() => import("./sections/Section11PropertyFinder")),
  "exports": lazy(() => import("./sections/Section12Exports")),
  "profile": lazy(() => import("./sections/Section14Profile")),
  "branding": lazy(() => import("./sections/Section15Branding")),
  "admin": lazy(() => import("./sections/Section16Admin")),
  "business-constraints": lazy(() => import("./sections/Section17BusinessRules")),
  "research-intelligence": lazy(() => import("./sections/Section18Research")),
};

interface UserManualContentProps {
  sections: UserManualSection[];
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
  sectionRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

export function UserManualContent({ sections, expandedSections, toggleSection, sectionRefs }: UserManualContentProps) {
  return (
    <main className="flex-1 space-y-4 min-w-0">
      {sections.map((section) => {
        const Component = sectionMap[section.id];
        if (!Component) return null;
        return (
          <Suspense key={section.id} fallback={<div className="h-14 rounded-xl bg-muted/30 animate-pulse" />}>
            <Component
              expanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              sectionRef={(el: HTMLDivElement | null) => { sectionRefs.current[section.id] = el; }}
            />
          </Suspense>
        );
      })}
    </main>
  );
}
