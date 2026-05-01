import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Minus } from "@/components/icons/themed-icons";
import { IconGitCompareArrows, IconRefreshCw, IconPlusCircle } from "@/components/icons";
import type { ScenarioCompareResult } from "./types";

function formatDiffValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (Math.abs(v) < 1 && v !== 0) return `${(v * 100).toFixed(1)}%`;
    return v.toLocaleString();
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

interface CompareResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ScenarioCompareResult | null;
}

export function CompareResultDialog({ open, onOpenChange, result }: CompareResultDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <IconGitCompareArrows className="w-5 h-5" />
            Scenario Comparison
          </DialogTitle>
          {result && (
            <DialogDescription className="label-text">
              <span className="font-semibold">{result.scenario1.name}</span>
              {" vs "}
              <span className="font-semibold">{result.scenario2.name}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        {result && (
          <div className="space-y-6 py-4">
            {/* Assumption diffs */}
            {result.assumptionDiffs.length > 0 && (
              <div>
                <h4 className="font-display font-semibold text-sm text-foreground mb-2 flex items-center gap-2">
                  <IconRefreshCw className="w-4 h-4" />
                  Assumption Changes ({result.assumptionDiffs.length})
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Field</TableHead>
                      <TableHead className="text-xs">{result.scenario1.name}</TableHead>
                      <TableHead className="text-xs">{result.scenario2.name}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.assumptionDiffs.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{d.field}</TableCell>
                        <TableCell className="font-mono text-xs text-destructive">{formatDiffValue(d.scenario1)}</TableCell>
                        <TableCell className="font-mono text-xs text-primary">{formatDiffValue(d.scenario2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Properties only in scenario 2 */}
            {result.propertyDiffs.filter(pd => pd.status === "added").length > 0 && (
              <div>
                <h4 className="font-display font-semibold text-sm text-primary mb-2 flex items-center gap-2">
                  <IconPlusCircle className="w-4 h-4" />
                  Only in {result.scenario2.name}
                </h4>
                <div className="space-y-1">
                  {result.propertyDiffs.filter(pd => pd.status === "added").map((pd, i) => (
                    <div key={i} className="text-sm px-3 py-1.5 rounded bg-primary/10 border border-primary/20 text-primary">
                      {pd.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Properties only in scenario 1 */}
            {result.propertyDiffs.filter(pd => pd.status === "removed").length > 0 && (
              <div>
                <h4 className="font-display font-semibold text-sm text-destructive mb-2 flex items-center gap-2">
                  <Minus className="w-4 h-4" />
                  Only in {result.scenario1.name}
                </h4>
                <div className="space-y-1">
                  {result.propertyDiffs.filter(pd => pd.status === "removed").map((pd, i) => (
                    <div key={i} className="text-sm px-3 py-1.5 rounded bg-destructive/10 border border-destructive/20 text-destructive">
                      {pd.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Property-level field changes */}
            {result.propertyDiffs.filter(pd => pd.status === "changed").length > 0 && (
              <div>
                <h4 className="font-display font-semibold text-sm text-foreground mb-2 flex items-center gap-2">
                  <IconRefreshCw className="w-4 h-4" />
                  Property Changes
                </h4>
                {result.propertyDiffs.filter(pd => pd.status === "changed").map((pd, i) => (
                  <div key={i} className="mb-4">
                    <p className="text-sm font-semibold text-foreground mb-1">{pd.name} ({pd.changes?.length ?? 0} changes)</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Field</TableHead>
                          <TableHead className="text-xs">{result.scenario1.name}</TableHead>
                          <TableHead className="text-xs">{result.scenario2.name}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pd.changes?.map((d, j) => (
                          <TableRow key={j}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{d.field}</TableCell>
                            <TableCell className="font-mono text-xs text-destructive">{formatDiffValue(d.scenario1)}</TableCell>
                            <TableCell className="font-mono text-xs text-primary">{formatDiffValue(d.scenario2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            )}

            {/* No differences */}
            {result.assumptionDiffs.length === 0 && result.propertyDiffs.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground label-text">These scenarios are identical.</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
