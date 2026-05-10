import { useState } from "react";
import type { AdminSaveState } from "@/components/admin/save-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PipelinePoliciesForm from "./PipelinePoliciesForm";
import ModelRoutingPanel from "@/components/admin/ai/ModelRoutingPanel";

interface PipelineConfigTabProps {
  onSaveStateChange?: (state: AdminSaveState | null) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function PipelineConfigTab({ onSaveStateChange }: PipelineConfigTabProps) {
  const [activeView, setActiveView] = useState<"policies" | "routing">("policies");

  return (
    <div data-testid="pipeline-config-tab">
      <div className="flex items-center gap-1 border-b border-border mb-6">
        <Button
          variant="ghost"
          onClick={() => setActiveView("policies")}
          data-testid="pipeline-subtab-policies"
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px rounded-none h-auto",
            activeView === "policies"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground"
          )}
        >
          Pipeline Policies
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveView("routing")}
          data-testid="pipeline-subtab-routing"
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px rounded-none h-auto",
            activeView === "routing"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground"
          )}
        >
          Model Routing
        </Button>
      </div>

      {activeView === "policies" && <PipelinePoliciesForm />}
      {activeView === "routing" && <ModelRoutingPanel />}
    </div>
  );
}
