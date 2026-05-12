import { useMemo } from "react";
import { AgentRosterAccordion } from "@/components/intelligence/agent-roster/AgentRosterAccordion";
import { getSpecialistsRoster } from "@/lib/agent-roster";

export default function SpecialistsRosterPage() {
  const entries = useMemo(() => getSpecialistsRoster(), []);
  return (
    <div data-testid="page-specialists-roster">
      <AgentRosterAccordion title="Specialists" entries={entries} testId="roster-specialists" />
    </div>
  );
}
