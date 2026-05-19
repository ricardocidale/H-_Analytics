import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AgentRosterAccordion } from "@/components/intelligence/agent-roster/AgentRosterAccordion";
import { getAgentsRoster } from "@/lib/agent-roster";
import { useLlmRegistry } from "@/lib/api/admin";
import { mergeRebeccaSettings } from "@shared/rebecca-settings";
import type { RosterEntry } from "@/lib/agent-roster";

export default function AgentsRosterPage() {
  const baseEntries = useMemo(() => getAgentsRoster(), []);

  const { data: globalData } = useQuery<Record<string, unknown>>({
    queryKey: ["globalAssumptions"],
    queryFn: async () => {
      const res = await fetch("/api/global-assumptions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: registry } = useLlmRegistry();

  const entries = useMemo((): RosterEntry[] => {
    const chatRec = registry?.recommendations?.find(
      (r) => r.function === "chat",
    );

    return baseEntries.map((entry) => {
      if (entry.id === "rebecca" && globalData) {
        const settings = mergeRebeccaSettings(globalData.rebeccaConfig);
        const vendor = settings.llm.provider;
        const model = settings.llm.model;
        if (vendor && model) {
          return {
            ...entry,
            llmInfo: {
              vendor,
              model,
              recommended: chatRec
                ? { vendor: chatRec.vendor, model: chatRec.modelId }
                : null,
            },
          };
        }
      }
      return entry;
    });
  }, [baseEntries, globalData, registry]);

  return (
    <div data-testid="page-agents-roster">
      <AgentRosterAccordion title="Agents" entries={entries} testId="roster-agents" />
    </div>
  );
}
