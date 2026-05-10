/**
 * RangesTable — loading state, empty state, and the table of reference
 * range rows with per-row Edit / Archive / Restore actions.
 *
 * Extracted from `../ReferenceRangesTab.tsx` (task-1360). The markup is
 * byte-identical to the original; row mutations come in as props from
 * the page shell.
 */
import { IconPencil } from "@/components/icons";
import { Archive, RotateCcw } from "@/components/icons/themed-icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CONFIDENCE_BADGE, FRESHNESS_BADGE } from "./constants";
import { formatJurisdiction, formatYear, freshness } from "./helpers";
import type { ReferenceRangeRow } from "./types";

type Props = {
  rows: ReferenceRangeRow[];
  rowsLoading: boolean;
  hasActiveFilter: boolean;
  restorePending: boolean;
  onRestore: (id: number) => void;
  onEdit: (row: ReferenceRangeRow) => void;
  onArchive: (row: ReferenceRangeRow) => void;
};

export function RangesTable({
  rows,
  rowsLoading,
  hasActiveFilter,
  restorePending,
  onRestore,
  onEdit,
  onArchive,
}: Props) {
  if (rowsLoading) {
    return (
      <div className="text-sm text-muted-foreground" data-testid="text-loading">
        Loading reference ranges…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center" data-testid="empty-state">
        <p className="text-sm font-medium">No reference ranges yet.</p>
        <p className="text-xs text-muted-foreground mt-1">
          {hasActiveFilter
            ? "No rows match the current filters."
            : "No reference ranges loaded yet."}
        </p>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="table-reference-ranges">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2">Domain</th>
            <th className="text-left px-3 py-2">Metric</th>
            <th className="text-left px-3 py-2">Jurisdiction</th>
            <th className="text-right px-3 py-2">Year</th>
            <th className="text-right px-3 py-2">Low / Mid / High</th>
            <th className="text-left px-3 py-2">Unit</th>
            <th className="text-left px-3 py-2">Source</th>
            <th className="text-left px-3 py-2">Confidence</th>
            <th className="text-left px-3 py-2">Verified</th>
            <th className="text-right px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const fresh = freshness(row.lastVerifiedAt);
            const isArchived = row.archivedAt !== null;
            return (
              <tr
                key={row.id}
                className={`border-t border-border/50 hover:bg-muted/20 ${isArchived ? "opacity-60" : ""}`}
                data-testid={`row-reference-range-${row.id}`}
              >
                <td className="px-3 py-2 font-medium text-xs uppercase tracking-wide" data-testid={`text-domain-${row.id}`}>
                  {row.domain}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium" data-testid={`text-label-${row.id}`}>{row.label}</div>
                  <div className="text-xs text-muted-foreground font-mono" data-testid={`text-metric-key-${row.id}`}>
                    {row.metricKey}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs" data-testid={`text-jurisdiction-${row.id}`}>
                  {formatJurisdiction(row)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid={`text-year-${row.id}`}>
                  {formatYear(row.year)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid={`text-range-${row.id}`}>
                  {row.low} / <span className="font-medium">{row.mid}</span> / {row.high}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground" data-testid={`text-unit-${row.id}`}>
                  {row.unit}
                </td>
                <td className="px-3 py-2 text-xs" data-testid={`text-source-${row.id}`}>
                  {row.sourceUrl ? (
                    <a
                      href={row.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-primary"
                      data-testid={`link-source-${row.id}`}
                    >
                      {row.sourceName ?? row.sourceUrl}
                    </a>
                  ) : (
                    row.sourceName ?? <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`text-[10px] uppercase tracking-wide border rounded px-2 py-0.5 ${
                      CONFIDENCE_BADGE[row.confidence] ?? CONFIDENCE_BADGE.medium
                    }`}
                    data-testid={`badge-confidence-${row.id}`}
                  >
                    {row.confidence}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] uppercase tracking-wide border rounded px-2 py-0.5 ${FRESHNESS_BADGE[fresh]}`}
                      data-testid={`badge-freshness-${row.id}`}
                    >
                      {fresh}
                    </span>
                    <span className="text-muted-foreground" data-testid={`text-verified-at-${row.id}`}>
                      {row.lastVerifiedAt
                        ? new Date(row.lastVerifiedAt).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                  {row.verifiedBy && (
                    <div className="text-[10px] text-muted-foreground mt-0.5" data-testid={`text-verified-by-${row.id}`}>
                      by {row.verifiedBy}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {isArchived ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRestore(row.id)}
                        disabled={restorePending}
                        data-testid={`button-restore-${row.id}`}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Restore
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onEdit(row)}
                          aria-label="Edit"
                          data-testid={`button-edit-${row.id}`}
                        >
                          <IconPencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onArchive(row)}
                          aria-label="Archive"
                          data-testid={`button-archive-${row.id}`}
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
