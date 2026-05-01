/**
 * AuditTab — append-only history of every config edit for one Specialist
 * (llm-config / required-fields / field-toggles / prerequisite-toggles /
 * runtime / cadence sections). Read-only. The section dropdown lets admins
 * narrow the table — most often used to answer "when did the cadence last
 * change?" (Task #398).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SpecialistAuditEntry, SpecialistConfigSectionType } from "../types";

type SectionFilter = "all" | SpecialistConfigSectionType;

const SECTION_FILTERS: Array<{ value: SectionFilter; label: string }> = [
  { value: "all", label: "All sections" },
  { value: "llm-config", label: "LLM config" },
  { value: "required-fields", label: "Required fields" },
  { value: "field-toggles", label: "Field toggles" },
  { value: "prerequisite-toggles", label: "Prerequisite toggles" },
  { value: "runtime", label: "Runtime" },
  { value: "cadence", label: "Cadence" },
];

export function AuditTab({ specialistId }: { specialistId: string }) {
  const { data, isLoading } = useQuery<SpecialistAuditEntry[]>({
    queryKey: [`/api/admin/specialists/${specialistId}/audit`],
  });
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const entries = data ?? [];
  const visibleEntries = useMemo(
    () => (sectionFilter === "all" ? entries : entries.filter((e) => e.section === sectionFilter)),
    [entries, sectionFilter],
  );
  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Audit history</CardTitle>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="audit-section-filter">
              Section
            </label>
            <Select
              value={sectionFilter}
              onValueChange={(v) => setSectionFilter(v as SectionFilter)}
            >
              <SelectTrigger
                id="audit-section-filter"
                className="w-48"
                data-testid="select-audit-section-filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_FILTERS.map((f) => (
                  <SelectItem
                    key={f.value}
                    value={f.value}
                    data-testid={`option-audit-section-${f.value}`}
                  >
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visibleEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-audit-empty">
            {entries.length === 0
              ? "No edits yet."
              : "No edits in this section yet."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border" data-testid="audit-table">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-2">Version</th>
                  <th className="p-2">Section</th>
                  <th className="p-2">Summary</th>
                  <th className="p-2">User</th>
                  <th className="p-2">When</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((e) => (
                  <tr key={e.id} className="border-t" data-testid={`audit-row-${e.id}`}>
                    <td className="p-2 font-mono text-xs">v{e.version}</td>
                    <td className="p-2">{e.section}</td>
                    <td className="p-2">
                      <div>{e.changeSummary ?? "—"}</div>
                      {e.changedFieldLabels && e.changedFieldLabels.length > 0 && (
                        <ul
                          className="mt-1 list-disc pl-4 text-xs text-muted-foreground"
                          data-testid={`audit-row-${e.id}-fields`}
                        >
                          {e.changedFieldLabels.map((label, i) => (
                            <li key={i}>{label}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="p-2 text-xs">
                      {e.changedByUserName ?? (e.changedByUserId != null ? `User #${e.changedByUserId}` : "—")}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{new Date(e.changedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
