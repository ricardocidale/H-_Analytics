import { useState } from "react";
import type { AdminSaveState } from "@/components/admin/save-state";
import PipelinePoliciesForm from "./PipelinePoliciesForm";
import ModelRoutingPanel from "@/components/admin/ai/ModelRoutingPanel";

interface PipelineConfigTabProps {
  onSaveStateChange?: (state: AdminSaveState | null) => void;
}

export default function PipelineConfigTab({ onSaveStateChange }: PipelineConfigTabProps) {
  const [activeView, setActiveView] = useState<"policies" | "routing">("policies");

  return (
    <div data-testid="pipeline-config-tab">
      <div className="flex items-center gap-1 border-b border-border mb-6">
        <button
          onClick={() => setActiveView("policies")}
          data-testid="pipeline-subtab-policies"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeView === "policies"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          Pipeline Policies
        </button>
        <button
          onClick={() => setActiveView("routing")}
          data-testid="pipeline-subtab-routing"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeView === "routing"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          Model Routing
        </button>
      </div>

      {activeView === "policies" && <PipelinePoliciesForm />}
      {activeView === "routing" && <ModelRoutingPanel />}
    </div>
  );
}
