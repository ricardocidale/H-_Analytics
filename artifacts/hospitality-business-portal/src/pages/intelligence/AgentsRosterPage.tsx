import { useMemo } from "react";
import { AgentRosterAccordion } from "@/components/intelligence/agent-roster/AgentRosterAccordion";
import { getAgentsRoster } from "@/lib/agent-roster";

export default function AgentsRosterPage() {
  const entries = useMemo(() => getAgentsRoster(), []);
  return (
    <div data-testid="page-agents-roster">
      <AgentRosterAccordion title="Agents" entries={entries} testId="roster-agents" />
    </div>
  );
}
