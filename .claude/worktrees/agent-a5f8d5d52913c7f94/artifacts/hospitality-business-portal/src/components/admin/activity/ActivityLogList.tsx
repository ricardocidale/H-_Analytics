import { User, LoginLog, ActiveSession } from "../types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableBody as UITableBody, TableCell as UITableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconClock, IconLogIn, IconLogOut, IconMonitor, IconPeople } from "@/components/icons";
import { formatDateTime, formatDuration } from "@/lib/formatters";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface ActivityLogListProps {
  users?: User[];
  loginLogs?: LoginLog[];
  logsLoading: boolean;
  activeSessionsList?: ActiveSession[];
  loginLogUserFilter: string;
  setLoginLogUserFilter: (v: string) => void;
  loginLogIpFilter: string;
  setLoginLogIpFilter: (v: string) => void;
}

export function ActivityLogList({
  users,
  loginLogs,
  logsLoading,
  activeSessionsList,
  loginLogUserFilter,
  setLoginLogUserFilter,
  loginLogIpFilter,
  setLoginLogIpFilter,
}: ActivityLogListProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { toast } = useToast();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const queryClient = useQueryClient();

  const activeSessionsCount = loginLogs?.filter(l => !l.logoutAt).length ?? 0;

  const filteredLogs = loginLogs?.filter(log => {
    if (loginLogUserFilter && String(log.userId) !== loginLogUserFilter) return false;
    if (loginLogIpFilter && !(log.ipAddress || "").toLowerCase().includes(loginLogIpFilter.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="relative">
          <CardTitle className="text-base font-semibold text-foreground">Login Activity</CardTitle>
          <CardDescription className="label-text">
            {loginLogs?.length ?? 0} login records | {activeSessionsCount} active sessions
          </CardDescription>
        </CardHeader>

        <CardContent className="relative space-y-4">
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-muted border border-border">
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-sm whitespace-nowrap">User</Label>
              <Select value={loginLogUserFilter || "all"} onValueChange={(v) => setLoginLogUserFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="bg-muted border-border text-foreground h-8 w-40 text-sm" data-testid="select-login-log-user-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users?.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-sm whitespace-nowrap">IP Address</Label>
              <Input
                value={loginLogIpFilter}
                onChange={(e) => setLoginLogIpFilter(e.target.value)}
                placeholder="Search IP..."
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 w-36 text-sm"
                data-testid="input-login-log-ip-filter"
              />
            </div>
            <span className="text-muted-foreground text-sm ml-auto">
              {filteredLogs?.length ?? 0} of {loginLogs?.length ?? 0} entries
            </span>
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs?.length === 0 ? (
            <div className="text-center py-12">
              <IconClock className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <p className="label-text">
                {loginLogs?.length === 0 ? "No login activity recorded yet" : "No logs match the current filters"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-display"><div className="flex items-center gap-2"><IconPeople className="w-4 h-4" />User</div></TableHead>
                  <TableHead className="text-muted-foreground font-display"><div className="flex items-center gap-2"><IconLogIn className="w-4 h-4" />Login Time</div></TableHead>
                  <TableHead className="text-muted-foreground font-display"><div className="flex items-center gap-2"><IconLogOut className="w-4 h-4" />Logout Time</div></TableHead>
                  <TableHead className="text-muted-foreground font-display"><div className="flex items-center gap-2"><IconClock className="w-4 h-4" />Duration</div></TableHead>
                  <TableHead className="text-muted-foreground font-display"><div className="flex items-center gap-2"><IconMonitor className="w-4 h-4" />IP Address</div></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs?.map((log) => (
                  <TableRow key={log.id} className="border-border hover:bg-muted" data-testid={`row-log-${log.id}`}>
                    <TableRowCell>
                      <div className="font-display">{log.userName || log.userEmail}</div>
                      {log.userName && <div className="text-xs text-muted-foreground">{log.userEmail}</div>}
                    </TableRowCell>
                    <TableRowCell className="text-foreground/80 font-mono text-sm">{formatDateTime(log.loginAt)}</TableRowCell>
                    <TableRowCell className="text-foreground/80 font-mono text-sm">
                      {log.logoutAt ? formatDateTime(log.logoutAt) : <span className="text-muted-foreground">Active</span>}
                    </TableRowCell>
                    <TableRowCell className="font-mono text-sm">
                      <span className={log.logoutAt ? "text-foreground/80" : "text-muted-foreground"}>
                        {formatDuration(log.loginAt, log.logoutAt)}
                      </span>
                    </TableRowCell>
                    <TableRowCell className="text-muted-foreground font-mono text-sm">{log.ipAddress || "-"}</TableRowCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {activeSessionsList && activeSessionsList.length > 0 && (
        <ActiveSessions activeSessionsList={activeSessionsList} />
      )}
    </>
  );
}

// Renamed to avoid name collision with TableCell from UI
function TableRowCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <UITableCell className={className}>{children}</UITableCell>;
}

function ActiveSessions({ activeSessionsList }: { activeSessionsList: ActiveSession[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return (
    <Card className="bg-card border border-border/80 shadow-sm mt-6">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Active Sessions</CardTitle>
        <CardDescription className="label-text">
          {activeSessionsList.length} active session{activeSessionsList.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">User</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Session Started</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Expires</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeSessionsList.map((s) => (
              <TableRow key={s.id} className="border-b border-border/60 hover:bg-muted">
                <TableRowCell className="text-foreground/80 text-sm">{s.userName || s.userEmail}</TableRowCell>
                <TableRowCell className="text-muted-foreground font-mono text-xs">{new Date(s.createdAt).toLocaleString()}</TableRowCell>
                <TableRowCell className="text-muted-foreground font-mono text-xs">{new Date(s.expiresAt).toLocaleString()}</TableRowCell>
                <TableRowCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive/80 hover:text-destructive/60 hover:bg-destructive/10"
                    onClick={async () => {
                      try {
                        await fetch(`/api/admin/sessions/${s.id}`, { method: "DELETE", credentials: "include" });
                        queryClient.invalidateQueries({ queryKey: ["admin", "active-sessions"] });
                        toast({ title: "Session terminated", description: `Force logged out ${s.userName || s.userEmail}` });
                      } catch {
                        toast({ title: "Error", description: "Failed to terminate session", variant: "destructive" });
                      }
                    }}
                    data-testid={`button-force-logout-${s.id.slice(0, 8)}`}
                  >
                    <IconLogOut className="w-4 h-4 mr-1" />
                    Force Logout
                  </Button>
                </TableRowCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
