import { Suspense, lazy } from "react";
import { SECTIONS } from "./constants";

const sectionComponents = [
  lazy(() => import("./sections/Section01AppOverview")),
  lazy(() => import("./sections/Section02MgmtCompany")),
  lazy(() => import("./sections/Section03PropertyPortfolio")),
  lazy(() => import("./sections/Section04GlobalAssumptions")),
  lazy(() => import("./sections/Section05PropertyAssumptions")),
  lazy(() => import("./sections/Section06CashflowStreams")),
  lazy(() => import("./sections/Section07FinancialStatements")),
  lazy(() => import("./sections/Section08ExportSystem")),
  lazy(() => import("./sections/Section09DesignConfig")),
  lazy(() => import("./sections/Section10ScenarioMgmt")),
  lazy(() => import("./sections/Section11MyProfile")),
  lazy(() => import("./sections/Section12DashboardKPIs")),
  lazy(() => import("./sections/Section13AIResearch")),
  lazy(() => import("./sections/Section14PropertyCRUD")),
  lazy(() => import("./sections/Section15TestingMethodology")),
  lazy(() => import("./sections/Section16PropertyFormulas")),
  lazy(() => import("./sections/Section17CompanyFormulas")),
  lazy(() => import("./sections/Section18ConsolidatedFormulas")),
  lazy(() => import("./sections/Section19InvestmentReturns")),
  lazy(() => import("./sections/Section20FundingFinancing")),
  lazy(() => import("./sections/Section21Glossary")),
];

interface ManualContentProps {
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
  sectionRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

export function ManualContent({ expandedSections, toggleSection, sectionRefs }: ManualContentProps) {
  return (
    <main className="flex-1 space-y-4 min-w-0">
      {SECTIONS.map((section, i) => {
        const Component = sectionComponents[i];
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
