/**
 * RefreshDiffDialog.tsx — Modal that shows the user the side-by-side diff
 * between the current benchmark ranges and the proposed ranges from the
 * Analyst refresh. The admin must explicitly Commit or Discard before any
 * change lands in the database.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Range = {
  dimensionKey: string;
  label: string;
  unit: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
};

interface Props {
  tableLabel: string;
  currentRanges: Range[];
  proposedRanges: Range[];
  evidence: Array<{ source: string; url?: string; finding: string }>;
  tokensUsed: number;
  sourceCount: number;
  onCommit: () => void;
  onDiscard: () => void;
  isCommitting: boolean;
}

function fmt(n: number | null) {
  if (n == null) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString();
  return String(n);
}

function diffClass(current: number | null, proposed: number | null): string {
  if (current == null || proposed == null) return "";
  if (proposed > current) return "text-emerald-600 font-medium";
  if (proposed < current) return "text-rose-600 font-medium";
  return "text-muted-foreground";
}

export default function RefreshDiffDialog({
  tableLabel,
  currentRanges,
  proposedRanges,
  evidence,
  tokensUsed,
  sourceCount,
  onCommit,
  onDiscard,
  isCommitting,
}: Props) {
  const currentByKey = Object.fromEntries(currentRanges.map(r => [r.dimensionKey, r]));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDiscard(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="refresh-diff-dialog">
        <DialogHeader>
          <DialogTitle>Review proposed ranges — {tableLabel}</DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground mb-3" data-testid="text-refresh-meta">
          {sourceCount} sources · {tokensUsed.toLocaleString()} tokens used
        </div>

        <div className="border rounded">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left p-2">Dimension</th>
                <th className="text-right p-2">Current (low / mid / high)</th>
                <th className="text-right p-2">Proposed (low / mid / high)</th>
              </tr>
            </thead>
            <tbody>
              {proposedRanges.map(p => {
                const c = currentByKey[p.dimensionKey];
                return (
                  <tr key={p.dimensionKey} className="border-t" data-testid={`diff-row-${p.dimensionKey}`}>
                    <td className="p-2">
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.unit}</div>
                    </td>
                    <td className="p-2 text-right text-muted-foreground">
                      {c ? `${fmt(c.valueLow)} / ${fmt(c.valueMid)} / ${fmt(c.valueHigh)}` : "—"}
                    </td>
                    <td className="p-2 text-right">
                      <span className={diffClass(c?.valueLow ?? null, p.valueLow)}>{fmt(p.valueLow)}</span>{" / "}
                      <span className={diffClass(c?.valueMid ?? null, p.valueMid)}>{fmt(p.valueMid)}</span>{" / "}
                      <span className={diffClass(c?.valueHigh ?? null, p.valueHigh)}>{fmt(p.valueHigh)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {evidence.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold mb-2">Evidence</h4>
            <ul className="space-y-1 text-xs">
              {evidence.map((e, i) => (
                <li key={i} className="border rounded p-2" data-testid={`evidence-${i}`}>
                  <div className="font-medium">{e.source}</div>
                  <div className="text-muted-foreground">{e.finding}</div>
                  {e.url && <a className="text-primary underline" href={e.url} target="_blank" rel="noreferrer">{e.url}</a>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onDiscard} disabled={isCommitting} data-testid="button-discard">
            Discard
          </Button>
          <Button onClick={onCommit} disabled={isCommitting} data-testid="button-commit">
            {isCommitting ? "Committing…" : "Commit changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
