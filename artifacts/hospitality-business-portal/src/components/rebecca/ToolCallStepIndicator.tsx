/**
 * ToolCallStepIndicator — renders per-tool-call animation steps inline in
 * Rebecca's assistant message bubble.
 *
 * Each step shows the persona orb that owns the tool (Gustavo for research,
 * Marco for the slide factory, Iris for resource ops, Rebecca for data tools)
 * alongside a human-readable label and the current phase.
 *
 * Phases:
 *   dispatching  → tool has been invoked, awaiting result (animated orb)
 *   complete     → tool returned successfully (orb settles)
 *   error        → tool raised an error (orb shows error state)
 */

import { motion, AnimatePresence } from "framer-motion";
import { AgentThinkingState } from "@/components/agent-animations";
import { useReducedMotion } from "@/components/agent-animations/useReducedMotion";
import { cn } from "@/lib/utils";
import type { AgentPersona, AgentPhase } from "@/components/agent-animations";

export interface ToolStep {
  /** Unique call identifier (from the LLM tool-call id). */
  id: string;
  /** Raw tool function name, e.g. "produce_slide_factory_deck". */
  name: string;
  /** Current execution phase. */
  phase: "dispatching" | "complete" | "error";
}

const SLIDE_FACTORY_TOOLS = new Set([
  "produce_slide_factory_deck",
  "trigger_slide_factory_build",
  "create_slide_factory_run",
  "record_slide_factory_brief",
  "accept_slide_factory_brief",
  "assign_slide_factory_properties",
  "update_slide_factory_slot",
  "approve_all_slide_factory_slots",
  "get_slide_factory_run",
  "list_slide_factory_runs",
  "get_lb_deck_config",
  "configure_lb_deck",
  "trigger_lb_deck_render",
  "get_lb_deck_render_status",
]);

const IRIS_TOOLS = new Set([
  "trigger_iris_health_check",
  "trigger_iris_reindex",
  "clear_iris_gaps",
  "get_iris_status",
  "write_retrieval_gap",
]);

const GUSTAVO_TOOLS = new Set([
  "trigger_research",
  "refresh_analyst_table",
]);

function toolToPersona(name: string): AgentPersona {
  if (SLIDE_FACTORY_TOOLS.has(name)) return "marco";
  if (IRIS_TOOLS.has(name)) return "iris";
  if (GUSTAVO_TOOLS.has(name)) return "gustavo";
  return "rebecca";
}

const TOOL_FRIENDLY_NAMES: Record<string, string> = {
  list_properties:                "Listing properties",
  get_property:                   "Reading property",
  list_scenarios:                 "Listing scenarios",
  get_scenario:                   "Reading scenario",
  update_property:                "Updating property",
  patch_property:                 "Patching property",
  create_scenario:                "Creating scenario",
  update_scenario:                "Updating scenario",
  update_scenario_assumptions:    "Updating assumptions",
  lock_scenario:                  "Locking scenario",
  delete_scenario:                "Deleting scenario",
  trigger_research:               "Running research",
  refresh_analyst_table:          "Refreshing analysis",
  write_retrieval_gap:            "Logging knowledge gap",
  trigger_iris_health_check:      "Checking resource health",
  trigger_iris_reindex:           "Re-indexing resources",
  clear_iris_gaps:                "Clearing gaps",
  get_iris_status:                "Checking Iris status",
  get_lb_deck_config:             "Reading deck config",
  configure_lb_deck:              "Configuring deck",
  trigger_lb_deck_render:         "Rendering deck",
  get_lb_deck_render_status:      "Checking render status",
  create_slide_factory_run:       "Creating slide run",
  list_slide_factory_runs:        "Listing slide runs",
  get_slide_factory_run:          "Reading slide run",
  record_slide_factory_brief:     "Recording brief",
  accept_slide_factory_brief:     "Accepting brief",
  assign_slide_factory_properties:"Assigning properties",
  update_slide_factory_slot:      "Updating slide slot",
  approve_all_slide_factory_slots:"Approving all slots",
  trigger_slide_factory_build:    "Building slides",
  produce_slide_factory_deck:     "Building investor deck",
};

function toolFriendlyName(name: string): string {
  return TOOL_FRIENDLY_NAMES[name] ?? name.replace(/_/g, " ");
}

const PHASE_ICON: Record<ToolStep["phase"], string> = {
  dispatching: "",
  complete: "✓",
  error: "✕",
};

const PHASE_COLOR: Record<ToolStep["phase"], string> = {
  dispatching: "text-muted-foreground",
  complete: "text-success",
  error: "text-destructive",
};

interface ToolCallStepIndicatorProps {
  steps: ToolStep[];
  className?: string;
}

export function ToolCallStepIndicator({ steps, className }: ToolCallStepIndicatorProps) {
  const reducedMotion = useReducedMotion();

  if (steps.length === 0) return null;

  return (
    <div
      className={cn("flex flex-col gap-1 mb-2", className)}
      role="status"
      aria-label="Tool calls in progress"
    >
      <AnimatePresence initial={false}>
        {steps.map((step) => {
          const persona = toolToPersona(step.name);
          const label = toolFriendlyName(step.name);
          const phase: AgentPhase = step.phase;
          const icon = PHASE_ICON[step.phase];
          const colorClass = PHASE_COLOR[step.phase];

          return reducedMotion ? (
            <div
              key={step.id}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <AgentThinkingState
                persona={persona}
                phase={phase}
                size="sm"
                aria-label={`${persona} ${step.phase}`}
              />
              <span className="leading-none">{label}</span>
              {icon && (
                <span className={cn("leading-none font-semibold", colorClass)}>{icon}</span>
              )}
            </div>
          ) : (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <AgentThinkingState
                persona={persona}
                phase={phase}
                size="sm"
                aria-label={`${persona} ${step.phase}`}
              />
              <AnimatePresence mode="wait">
                <motion.span
                  key={`${step.id}-${step.phase}`}
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  className="leading-none"
                >
                  {label}
                </motion.span>
              </AnimatePresence>
              {icon && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, ease: "backOut" }}
                  className={cn("leading-none font-semibold text-[10px]", colorClass)}
                >
                  {icon}
                </motion.span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
