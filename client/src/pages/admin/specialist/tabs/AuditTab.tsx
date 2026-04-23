/**
 * AuditTab — append-only history of every config edit for one Specialist
 * (llm-config / required-fields / runtime sections). Read-only.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "@/components/icons/themed-icons";
import type { SpecialistAuditEntry } from "../types";

export function AuditTab({ specialistId }: { specialistId: string }) {
  const { data, isLoading } = useQuery<SpecialistAuditEntry[]>({
    queryKey: [`/api/admin/specialists/${specialistId}/audit`],
  });
  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin" />;
  const entries = data ?? [];
  return (
    <Card>
      <CardHeader><CardTitle>Audit history</CardTitle></CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No edits yet.</p>
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
                {entries.map((e) => (
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
                    <td className="p-2 font-mono text-xs">{e.changedByUserId ?? "—"}</td>
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
