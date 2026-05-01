import { CheckerActivityData } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CheckerActivityProps {
  checkerActivity?: CheckerActivityData;
}

export function CheckerActivity({ checkerActivity }: CheckerActivityProps) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border border-border/80 shadow-sm">
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-muted-foreground">{checkerActivity?.summary.totalActions ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Actions</div>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border/80 shadow-sm">
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-chart-1">{checkerActivity?.summary.verificationRuns ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Verification Runs</div>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border/80 shadow-sm">
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-chart-2">{checkerActivity?.summary.manualViews ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Manual Reviews</div>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border/80 shadow-sm">
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-foreground">{checkerActivity?.summary.exports ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Exports</div>
          </CardContent>
        </Card>
      </div>

      {checkerActivity?.checkers && checkerActivity.checkers.length > 0 && (
        <Card className="bg-card border border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Checker Users</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Email</TableHead>
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground text-center">Actions</TableHead>
                  <TableHead className="text-muted-foreground text-center">Verifications</TableHead>
                  <TableHead className="text-muted-foreground text-center">Reviews</TableHead>
                  <TableHead className="text-muted-foreground text-center">Exports</TableHead>
                  <TableHead className="text-muted-foreground">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkerActivity.checkers.map((checker) => (
                  <TableRow key={checker.id} className="border-border">
                    <TableCell className="text-foreground font-mono text-sm">{checker.email}</TableCell>
                    <TableCell className="text-foreground/80">{checker.name || "-"}</TableCell>
                    <TableCell className="text-foreground/80 text-center">{checker.totalActions}</TableCell>
                    <TableCell className="text-chart-1 text-center font-semibold">{checker.verificationRuns}</TableCell>
                    <TableCell className="text-chart-2 text-center font-semibold">{checker.manualViews}</TableCell>
                    <TableCell className="text-foreground/80 text-center">{checker.exports}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(checker.lastActive)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <RecentCheckerActivity checkerActivity={checkerActivity} formatDate={formatDate} />
    </div>
  );
}

function RecentCheckerActivity({ checkerActivity, formatDate }: { checkerActivity?: CheckerActivityData, formatDate: (d: string | null) => string }) {
  return (
    <Card className="bg-card border border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">Recent Checker Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {(!checkerActivity?.recentActivity || checkerActivity.recentActivity.length === 0) ? (
          <p className="text-muted-foreground text-center py-8">No checker activity recorded yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-muted-foreground">Time</TableHead>
                <TableHead className="text-muted-foreground">User</TableHead>
                <TableHead className="text-muted-foreground">Action</TableHead>
                <TableHead className="text-muted-foreground">Entity</TableHead>
                <TableHead className="text-muted-foreground">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checkerActivity.recentActivity.map((log) => (
                <TableRow key={log.id} className="border-border">
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{formatDate(log.createdAt)}</TableCell>
                  <TableCell className="text-foreground font-mono text-sm">{log.userEmail}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      log.action === "run_verification" ? "bg-chart-3/15 text-chart-3" :
                      log.action === "manual_view" ? "bg-chart-1/15 text-chart-1" :
                      log.action === "export_csv" || log.action === "export_pdf" ? "bg-primary/15 text-primary" :
                      "bg-muted text-foreground"
                    }`}>
                      {log.action.replace(/_/g, " ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-foreground/80 text-sm">{log.entityName || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs truncate max-w-xs">
                    {log.metadata ? JSON.stringify(log.metadata) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
