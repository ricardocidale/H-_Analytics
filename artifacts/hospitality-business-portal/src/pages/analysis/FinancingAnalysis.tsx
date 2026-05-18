import { useRef } from "react";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { ContentPanel } from "@/components/ui/content-panel";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { IconCalculator, IconTrending, IconAnalysis, IconShield } from "@/components/icons";
import { AnimatedPage, ScrollReveal } from "@/components/graphics";
import { DSCRTab, DebtYieldTab, StressTestTab, PrepaymentTab } from "@/components/financing";
import { ExportMenu, pngAction } from "@/components/ui/export-toolbar";

type TabId = "dscr" | "debt-yield" | "sensitivity" | "prepayment";

const SECTION_META: {
  id: TabId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  Content: React.ComponentType;
}[] = [
  {
    id: "dscr",
    label: "DSCR Sizing",
    Icon: IconCalculator,
    title: "DSCR Loan Sizing",
    body: "Determines the maximum loan amount a property can support based on its Debt Service Coverage Ratio (DSCR). Lenders typically require a minimum DSCR of 1.20x–1.35x, meaning the property's NOI must exceed annual debt payments by that multiple. Enter your property's NOI and loan terms to see how much you can borrow.",
    Content: DSCRTab,
  },
  {
    id: "debt-yield",
    label: "Debt Yield",
    Icon: IconTrending,
    title: "Debt Yield Analysis",
    body: "Debt Yield = NOI / Loan Amount. It measures the lender's return if they had to foreclose. Most commercial lenders require a minimum debt yield of 8–10%. This tool calculates your debt yield and determines the maximum loan based on that threshold, then compares it against the LTV constraint to find the binding limit.",
    Content: DebtYieldTab,
  },
  {
    id: "sensitivity",
    label: "Stress Test",
    Icon: IconAnalysis,
    title: "Debt Stress Testing",
    body: "Tests how your loan performs under adverse conditions. The matrix shows DSCR at every combination of interest rate changes (in basis points) and NOI changes (in percent). Red cells indicate scenarios where DSCR falls below your minimum threshold — signaling potential covenant violations or debt service shortfalls.",
    Content: StressTestTab,
  },
  {
    id: "prepayment",
    label: "Prepayment",
    Icon: IconShield,
    title: "Prepayment Penalty Calculator",
    body: "Calculates the cost of paying off a loan early. Three common methods: Yield Maintenance (compensates the lender for lost interest), Step-Down (declining percentage penalty over time, e.g. 5-4-3-2-1), and Defeasance (replacing the loan with government securities). Understanding prepayment costs is critical for refinancing or sale decisions.",
    Content: PrepaymentTab,
  },
];

export default function FinancingAnalysis({ embedded }: { embedded?: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);

  const handleExportPNG = async () => {
    try {
      const { captureToPng } = await import("@/lib/exports/domCapture");
      const dataUrl = await captureToPng(contentRef.current!);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "Financing-Analysis.png";
      a.click();
    } catch {
      /* silent — PNG capture is best-effort */
    }
  };

  const Wrapper = embedded
    ? ({ children }: { children: React.ReactNode }) => <>{children}</>
    : Layout;

  return (
    <Wrapper>
      <AnimatedPage>
        <div className="space-y-6 p-4 md:p-6">
          {!embedded && (
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <PageHeader
                title="Financing Analysis"
                subtitle="Loan sizing, debt yield analysis, stress testing, and prepayment modeling"
              />
              <div className="shrink-0 pt-1">
                <ExportMenu
                  actions={[pngAction(handleExportPNG, "button-financing-export-png")]}
                />
              </div>
            </div>
          )}

          <ScrollReveal>
            <div ref={contentRef}>
              <CollapsibleSection
                defaultOpenAll
                items={SECTION_META.map((s) => ({
                  id: s.id,
                  summary: (
                    <span className="flex items-center gap-2">
                      <s.Icon className="w-4 h-4 shrink-0" />
                      {s.label}
                    </span>
                  ),
                  expandedContent: (
                    <ContentPanel variant="light">
                      <div className="space-y-6">
                        <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-3 border border-border/50">
                          <s.Icon className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                          <div>
                            <h3 className="text-sm font-semibold text-foreground mb-1">
                              {s.title}
                            </h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {s.body}
                            </p>
                          </div>
                        </div>
                        <s.Content />
                      </div>
                    </ContentPanel>
                  ),
                }))}
              />
            </div>
          </ScrollReveal>
        </div>
      </AnimatedPage>
    </Wrapper>
  );
}
