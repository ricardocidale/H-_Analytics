import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AgentRosterAccordion } from "@/components/intelligence/agent-roster/AgentRosterAccordion";
import { getSpecialistsRoster } from "@/lib/agent-roster";
import { useLlmRegistry } from "@/lib/api/admin";
import type { RosterEntry } from "@/lib/agent-roster";

interface SpecialistListItem {
  id: string;
  hasLlmOverrides?: boolean;
}

export default function SpecialistsRosterPage() {
  const baseEntries = useMemo(() => getSpecialistsRoster(), []);

  const { data: specialistsList } = useQuery<SpecialistListItem[]>({
    queryKey: ["/api/admin/specialists"],
  });

  const { data: registry } = useLlmRegistry();

  const entries = useMemo((): RosterEntry[] => {
    if (!registry && !specialistsList) return baseEntries;

    const overrideMap = new Map<string, boolean>(
      (specialistsList ?? []).map((s) => [s.id, s.hasLlmOverrides ?? false]),
    );

    const deepRec = registry?.recommendations?.find(
      (r) => r.function === "research-deep",
    );

    return baseEntries.map((entry) => ({
      ...entry,
      llmInfo: deepRec
        ? {
            vendor: deepRec.vendor,
            model: deepRec.modelId,
            recommended: { vendor: deepRec.vendor, model: deepRec.modelId },
            hasOverrides: overrideMap.get(entry.id) ?? false,
          }
        : overrideMap.get(entry.id)
          ? {
              vendor: "—",
              model: "custom override active",
              hasOverrides: true,
            }
          : null,
    }));
  }, [baseEntries, specialistsList, registry]);

  return (
    <div data-testid="page-specialists-roster">
      <AgentRosterAccordion
        title="Specialists"
        entries={entries}
        testId="roster-specialists"
      />
    </div>
  );
}
