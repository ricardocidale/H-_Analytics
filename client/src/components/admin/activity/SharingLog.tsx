import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User, ActivityLogEntry } from "../types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconShare, IconUsers } from "@/components/icons";

interface SharingLogProps {
  users?: User[];
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  share: { label: "Shared", color: "bg-primary/20 text-primary" },
  share_all: { label: "Shared All", color: "bg-primary/20 text-primary" },
  grant_access: { label: "Granted Access", color: "bg-chart-3/20 text-chart-3" },
  revoke_access: { label: "Revoked Access", color: "bg-destructive/20 text-destructive/80" },
  "admin-grant-scenario-access": { label: "Admin Granted", color: "bg-chart-1/20 text-chart-1" },
  "admin-revoke-scenario-access": { label: "Admin Revoked", color: "bg-destructive/20 text-destructive/80" },
  "admin-unshare-all": { label: "Admin Unshared All", color: "bg-destructive/20 text-destructive/80" },
};

function formatActionLabel(action: string): { label: string; color: string } {
  return ACTION_LABELS[action] || { label: action, color: "bg-muted text-muted-foreground" };
}

function formatEntityDetail(log: ActivityLogEntry): string {
  if (log.entityName) return log.entityName;
  if (log.metadata) {
    const meta = log.metadata;
    const parts: string[] = [];
    if (meta.targetType) parts.push(`${meta.targetType}: ${meta.targetId}`);
    if (meta.recipientEmail) parts.push(meta.recipientEmail as string);
    return parts.join(", ") || "—";
  }
  return "—";
}

export function SharingLog({ users }: SharingLogProps) {
  const [userFilter, setUserFilter] = useState<string>("");

  const { data: sharingLogs, isLoading } = useQuery<ActivityLogEntry[]>({
    queryKey: ["admin", "sharing-log", userFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (userFilter) params.set("userId", userFilter);
      const res = await fetch(`/api/admin/sharing-log?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sharing log");
      return res.json();
    },
  });

  const shareCount = sharingLogs?.filter(l => l.action === "share" || l.action === "share_all" || l.action === "grant_access" || l.action === "admin-grant-scenario-access").length ?? 0;
  const revokeCount = sharingLogs?.filter(l => l.action === "revoke_access" || l.action === "admin-revoke-scenario-access" || l.action === "admin-unshare-all").length ?? 0;

  return (
    <div className="space-y-6">
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <IconShare className="w-5 h-5 text-primary" />
            Scenario Sharing Transaction Log
          </CardTitle>
          <CardDescription className="label-text">
            {sharingLogs?.length ?? 0} sharing event{(sharingLogs?.length ?? 0) !== 1 ? "s" : ""} recorded
            {sharingLogs && sharingLogs.length > 0 && (
              <span className="ml-2">
                ({shareCount} grant{shareCount !== 1 ? "s" : ""}, {revokeCount} revoke{revokeCount !== 1 ? "s" : ""})
              </span>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="relative space-y-4">
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-muted border border-border">
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-sm whitespace-nowrap">User</Label>
              <Select value={userFilter || "all"} onValueChange={(v) => setUserFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="bg-muted border-border text-foreground h-8 w-48 text-sm" data-testid="select-sharing-log-user-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users?.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-muted-foreground text-sm ml-auto">
              {sharingLogs?.length ?? 0} entries
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : !sharingLogs?.length ? (
            <div className="text-center py-12">
              <IconUsers className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <p className="label-text">No sharing activity recorded yet</p>
              <p className="text-xs text-muted-foreground mt-1">Shares, grants, and revocations will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Time</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">User</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Action</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Scenario / Target</TableHead>
                    <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sharingLogs.map((log) => {
                    const { label, color } = formatActionLabel(log.action);
                    return (
                      <TableRow key={log.id} className="border-b border-border/60 hover:bg-muted" data-testid={`row-sharing-log-${log.id}`}>
                        <TableCell className="text-muted-foreground text-xs font-mono whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-foreground/80 text-sm">
                          {log.userName || log.userEmail}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs font-mono ${color} border-0`}>
                            {label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-foreground/80 text-sm max-w-[200px] truncate">
                          {formatEntityDetail(log)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs max-w-[250px] truncate">
                          {log.metadata ? formatMetadata(log) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatMetadata(log: ActivityLogEntry): string {
  if (!log.metadata) return "—";
  const meta = log.metadata;
  const parts: string[] = [];
  if (meta.targetType && meta.targetId) {
    parts.push(`${meta.targetType} #${meta.targetId}`);
  }
  if (meta.sharesRemoved || meta.accessRemoved) {
    parts.push(`removed: ${(meta.sharesRemoved || 0)} shares, ${(meta.accessRemoved || 0)} access`);
  }
  if (parts.length === 0) {
    const raw = JSON.stringify(meta);
    return raw.length > 80 ? raw.slice(0, 80) + "..." : raw;
  }
  return parts.join(" | ");
}
