import { useState } from "react";
import type { AdminSaveState } from "@/components/admin/save-state";
import { CurrentThemeTab } from "@/components/ui/tabs";
import PipelinePoliciesForm from "./PipelinePoliciesForm";
import ModelRoutingPanel from "@/components/admin/ai/ModelRoutingPanel";

interface PipelineConfigTabProps {
  onSaveStateChange?: (state: AdminSaveState | null) => void;
}

const PIPELINE_TABS = [
  { value: "policies", label: "Pipeline Policies" },
  { value: "routing",  label: "Model Routing" },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function PipelineConfigTab({ onSaveStateChange }: PipelineConfigTabProps) {
  const [activeView, setActiveView] = useState<"policies" | "routing">("policies");

  return (
    <div data-testid="pipeline-config-tab">
      <div className="mb-6">
        <CurrentThemeTab
          tabs={PIPELINE_TABS}
          activeTab={activeView}
          onTabChange={(v) => setActiveView(v as "policies" | "routing")}
        />
      </div>
      {activeView === "policies" && <PipelinePoliciesForm />}
      {activeView === "routing"  && <ModelRoutingPanel />}
    </div>
  );
}
