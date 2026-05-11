import { useMemo } from "react";
import { AgentRosterAccordion } from "@/components/intelligence/agent-roster/AgentRosterAccordion";
import { getMinionsRoster } from "@/lib/agent-roster";

export default function MinionsRosterPage() {
  const entries = useMemo(() => getMinionsRoster(), []);
  return (
    <div data-testid="page-minions-roster">
      <AgentRosterAccordion title="Minions" entries={entries} testId="roster-minions" />
    </div>
  );
}
