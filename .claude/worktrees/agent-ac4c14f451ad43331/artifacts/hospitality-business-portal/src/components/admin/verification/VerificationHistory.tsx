import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/formatters";
import type { VerificationHistoryEntry } from "./types";

interface VerificationHistoryProps {
  history: VerificationHistoryEntry[];
}

export function VerificationHistory({ history }: VerificationHistoryProps) {
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Timestamp</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground text-center">Opinion</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground text-center">Checks</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground text-center">Passed</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground text-center">Failed</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((entry) => (
            <TableRow key={entry.id} className="hover:bg-muted/50 transition-colors">
              <TableCell className="text-xs font-medium text-foreground">{formatDateTime(entry.createdAt)}</TableCell>
              <TableCell className="text-center">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  entry.auditOpinion === 'UNQUALIFIED' ? 'bg-primary/15 text-primary' :
                  entry.auditOpinion === 'QUALIFIED' ? 'bg-accent-pop/15 text-accent-pop' :
                  'bg-destructive/15 text-destructive'
                }`}>
                  {entry.auditOpinion}
                </span>
              </TableCell>
              <TableCell className="text-xs text-center font-mono text-muted-foreground">{entry.totalChecks}</TableCell>
              <TableCell className="text-xs text-center font-mono text-primary font-bold">{entry.passed}</TableCell>
              <TableCell className="text-xs text-center font-mono text-destructive font-bold">{entry.failed}</TableCell>
              <TableCell className="text-right">
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  entry.overallStatus === 'PASS' ? 'text-secondary' :
                  entry.overallStatus === 'WARNING' ? 'text-accent-pop' :
                  'text-destructive'
                }`}>
                  {entry.overallStatus}
                </span>
              </TableCell>
            </TableRow>
          ))}
          {history.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                No verification history found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
