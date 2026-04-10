import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics";
import { KPIGrid } from "@/components/graphics";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useScenarioActions } from "./scenarios/useScenarioActions";
import { MyScenariosCard } from "./scenarios/MyScenariosCard";
import { SharedScenariosCard } from "./scenarios/SharedScenariosCard";
import { ScenarioDialogs } from "./scenarios/ScenarioDialogs";

export default function Scenarios() {
  const actions = useScenarioActions();
  const { isLoading, isError, canManageScenarios, manualScenarios } = actions;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (isError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <IconAlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-muted-foreground">Failed to load scenarios. Please try refreshing the page.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <AnimatedPage>
      <TooltipProvider>
      <div className="space-y-8">
        <PageHeader 
          title="Scenarios" 
          subtitle="Save and load different versions of your assumptions and properties"
          variant="dark"
        />

        <KPIGrid
          data-testid="kpi-scenarios"
          items={[
            { label: "Total Scenarios", value: manualScenarios.length, sublabel: "saved snapshots" },
            { label: "Latest Saved", value: manualScenarios.length, format: () => manualScenarios.length ? new Date(manualScenarios[0].updatedAt || manualScenarios[0].createdAt).toLocaleDateString() : "—", sublabel: "most recent" },
          ]}
          columns={2}
          variant="light"
        />

        {!canManageScenarios && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-accent-pop/10 border border-accent-pop/20 text-accent-pop text-sm" data-testid="text-no-scenario-permission">
            <IconAlertTriangle className="w-4 h-4 shrink-0" />
            Scenario management is disabled for your account. Contact an admin to enable it.
          </div>
        )}

        <MyScenariosCard actions={actions} />
        <SharedScenariosCard actions={actions} />
        <ScenarioDialogs actions={actions} />
      </div>
      </TooltipProvider>
      </AnimatedPage>
    </Layout>
  );
}
