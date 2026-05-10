/**
 * AssumptionsGate — friendly panel rendered in place of downstream pages
 * (Simulation, Compare, Sensitivity, Executive Summary, Dashboard) until the
 * user has saved every Company Assumptions tab at least once.
 *
 * Each missing tab is a clickable chip that deep-links into Company
 * Assumptions on the right tab via the existing `?tab=` URL convention.
 */
import { Link } from "wouter";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { IconAlertTriangle, IconCheckCircle } from "@/components/icons";
import {
  TAB_LABELS,
  type CompanyAssumptionsTabKey,
} from "@/hooks/useCompanyAssumptionsConfirmation";

export interface AssumptionsGateProps {
  missingTabs: CompanyAssumptionsTabKey[];
  /** Optional: name of the page being gated (used in copy). */
  pageLabel?: string;
}

export function AssumptionsGate({ missingTabs, pageLabel = "this page" }: AssumptionsGateProps) {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div
          className="w-full max-w-xl flex flex-col items-center text-center gap-5 py-12"
          data-testid="panel-assumptions-gate"
        >
          <div className="flex flex-col items-center gap-2">
            <IconAlertTriangle className="w-6 h-6 text-muted-foreground" />
            <h2 className="text-lg font-semibold font-display" data-testid="text-gate-title">
              Save your Company Assumptions first
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Before {pageLabel} can run, every Company Assumptions tab needs to be saved at least once.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2" data-testid="list-missing-tabs">
            {missingTabs.map((tab) => (
              <Link
                key={tab}
                to={`/company/assumptions?tab=${tab}`}
                data-testid={`chip-missing-tab-${tab}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-muted transition-colors"
              >
                {TAB_LABELS[tab]}
              </Link>
            ))}
            {missingTabs.length === 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                <IconCheckCircle className="w-4 h-4" /> All tabs saved
              </span>
            )}
          </div>

          <Link to="/company/assumptions">
            <Button data-testid="button-go-to-assumptions">Go to Company Assumptions</Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}

/**
 * Convenience wrapper: renders the gate when not confirmed, otherwise
 * renders children. Use as a route-level guard around downstream pages.
 */
import { useCompanyAssumptionsConfirmation } from "@/hooks/useCompanyAssumptionsConfirmation";

export function AssumptionsGateGuard({
  pageLabel,
  children,
}: {
  pageLabel?: string;
  children: React.ReactNode;
}) {
  const { confirmed, missingTabs, isLoading } = useCompanyAssumptionsConfirmation();
  // While loading, render a neutral skeleton — never the gated children —
  // so the gate cannot be bypassed during the initial fetch.
  if (isLoading) {
    return (
      <Layout>
        <div
          className="flex items-center justify-center min-h-[60vh]"
          data-testid="loader-assumptions-gate"
        >
          <div className="h-6 w-6 rounded-full border-2 border-accent-pop/30 border-t-accent-pop animate-spin" />
        </div>
      </Layout>
    );
  }
  if (!confirmed) return <AssumptionsGate missingTabs={missingTabs} pageLabel={pageLabel} />;
  return <>{children}</>;
}
