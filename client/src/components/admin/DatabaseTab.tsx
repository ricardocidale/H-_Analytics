/**
 * DatabaseTab.tsx — Database overview and seed data management.
 *
 * Provides admin visibility into the database and tools for initial setup:
 *
 *   Entity Counts:
 *     Displays row counts for key tables (users, companies, properties,
 *     global assumptions, etc.) so admins can quickly verify the database
 *     state and spot anomalies.
 *
 *   Seed Data:
 *     A "Populate" button that runs the server-side seed script, which
 *     inserts sample properties, default global assumptions, demo users,
 *     and fee categories. Useful for:
 *       • Setting up a new production instance
 *       • Resetting a demo environment
 *       • Populating a staging database for testing
 *
 *     The seed operation streams progress via SSE (Server-Sent Events)
 *     and shows a real-time log of inserted entities.
 *
 * Caution: seeding is additive — it does not truncate existing data.
 */
import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconRefreshCw, IconUpload, IconAlertTriangle, IconCheckCircle2, IconXCircle, IconDatabase, IconShield } from "@/components/icons";
export default function DatabaseTab() {
  const { toast } = useToast();
  const [syncResults, setSyncResults] = useState<Record<string, any> | null>(null);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [canonicalConfirmOpen, setCanonicalConfirmOpen] = useState(false);
  const [canonicalResult, setCanonicalResult] = useState<Record<string, any> | null>(null);

  const checkSyncStatus = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/sync-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to check sync status");
      return res.json();
    },
    onSuccess: (data) => {
      setSyncResults(data);
    },
    onError: (error: Error) => {
      toast({ title: "Sync Check Failed", description: error.message, variant: "destructive" });
    },
  });

  const executeSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/seed-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Fill failed" }));
        throw new Error(errData.error || "Fill failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Fill Complete", description: data.message || "Missing values populated successfully" });
      setSyncConfirmOpen(false);
      checkSyncStatus.mutate();
    },
    onError: (error: Error) => {
      toast({ title: "Fill Failed", description: error.message, variant: "destructive" });
      setSyncConfirmOpen(false);
    },
  });

  const canonicalSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/sync-canonical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Sync failed" }));
        throw new Error(errData.error || "Sync failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCanonicalResult(data);
      setCanonicalConfirmOpen(false);
      const total = (data.usersFixed ?? 0) + (data.orphanedFeeCategoriesDeleted ?? 0) +
        (data.orphanedResearchDeleted ?? 0) + (data.scenariosCleaned ?? 0) + (data.feeCategoriesFixed ?? 0);
      toast({
        title: "Canonical Sync Complete",
        description: total > 0 ? `${total} item(s) corrected` : "Everything already in sync",
      });
      checkSyncStatus.mutate();
    },
    onError: (error: Error) => {
      toast({ title: "Canonical Sync Failed", description: error.message, variant: "destructive" });
      setCanonicalConfirmOpen(false);
    },
  });

  const syncAutoChecked = useRef(false);
  useEffect(() => {
    if (!syncResults && !checkSyncStatus.isPending && !syncAutoChecked.current) {
      syncAutoChecked.current = true;
      checkSyncStatus.mutate();
    }
  }, []);

  return (
    <div className="space-y-6">
      <Card className="bg-card border border-border/80 shadow-sm" data-testid="card-database-sync">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <IconDatabase className="w-5 h-5" /> Database Status
          </CardTitle>
          <CardDescription className="label-text">
            View current database entity counts, global assumptions, and property details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            onClick={() => { setSyncResults(null); checkSyncStatus.mutate(); }}
            disabled={checkSyncStatus.isPending}
            data-testid="button-check-status"
          >
            {checkSyncStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconRefreshCw className="w-4 h-4 mr-2" />}
            Check Status
          </Button>

          {syncResults && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
                <div className="bg-muted rounded-xl p-4 text-center" data-testid="stat-users-count">
                  <p className="text-2xl font-bold text-muted-foreground">{syncResults.summary?.users ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Users</p>
                </div>
                <div className="bg-muted rounded-xl p-4 text-center" data-testid="stat-properties-count">
                  <p className="text-2xl font-bold text-muted-foreground">{syncResults.summary?.properties ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Properties</p>
                </div>
                <div className="bg-muted rounded-xl p-4 text-center" data-testid="stat-groups-count">
                  <p className="text-2xl font-bold text-muted-foreground">{syncResults.summary?.userGroups ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">User Groups</p>
                </div>
                <div className="bg-muted rounded-xl p-4 text-center" data-testid="stat-logos-count">
                  <p className="text-2xl font-bold text-muted-foreground">{syncResults.summary?.logos ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Logos</p>
                </div>
                <div className="bg-muted rounded-xl p-4 text-center" data-testid="stat-themes-count">
                  <p className="text-2xl font-bold text-muted-foreground">{syncResults.summary?.themes ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Themes</p>
                </div>
                <div className="bg-muted rounded-xl p-4 text-center" data-testid="stat-asset-descriptions-count">
                  <p className="text-2xl font-bold text-muted-foreground">{syncResults.summary?.assetDescriptions ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Asset Descs</p>
                </div>
                <div className="bg-muted rounded-xl p-4 text-center" data-testid="stat-fee-categories">
                  <p className="text-2xl font-bold text-muted-foreground">{syncResults.summary?.totalFeeCategories ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Fee Categories</p>
                </div>
                <div className="bg-muted rounded-xl p-4 text-center" data-testid="stat-global-assumptions">
                  <p className="text-2xl font-bold text-muted-foreground">{syncResults.summary?.hasGlobalAssumptions ? "Yes" : "No"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Global Assumptions</p>
                </div>
              </div>

              {syncResults.globalAssumptions && (
                <Card className="bg-card border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Global Assumptions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Base Mgmt Fee:</span> <span className="font-mono">{((syncResults.globalAssumptions.baseManagementFee ?? 0) * 100).toFixed(1)}%</span></div>
                      <div><span className="text-muted-foreground">Incentive Fee:</span> <span className="font-mono">{((syncResults.globalAssumptions.incentiveManagementFee ?? 0) * 100).toFixed(1)}%</span></div>
                      <div><span className="text-muted-foreground">Inflation:</span> <span className="font-mono">{((syncResults.globalAssumptions.inflationRate ?? 0) * 100).toFixed(1)}%</span></div>
                      <div><span className="text-muted-foreground">Tax Rate:</span> <span className="font-mono">{((syncResults.globalAssumptions.companyTaxRate ?? 0) * 100).toFixed(1)}%</span></div>
                      <div><span className="text-muted-foreground">Exit Cap:</span> <span className="font-mono">{((syncResults.globalAssumptions.exitCapRate ?? 0) * 100).toFixed(1)}%</span></div>
                      <div><span className="text-muted-foreground">Commission:</span> <span className="font-mono">{((syncResults.globalAssumptions.commissionRate ?? 0) * 100).toFixed(1)}%</span></div>
                      <div className="col-span-2"><span className="text-muted-foreground">Company:</span> <span className="font-medium">{syncResults.globalAssumptions.companyName}</span></div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {syncResults.properties?.length > 0 && (
                <Card className="bg-card border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Properties ({syncResults.properties.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead className="text-right">Rooms</TableHead>
                          <TableHead className="text-right">ADR</TableHead>
                          <TableHead className="text-right">Base Fee</TableHead>
                          <TableHead className="text-right">Exit Cap</TableHead>
                          <TableHead className="text-center">Research</TableHead>
                          <TableHead className="text-center">Fee Cats</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {syncResults.properties.map((prop: any) => (
                          <TableRow key={prop.id} data-testid={`row-property-${prop.id}`}>
                            <TableCell className="font-medium" data-testid={`text-property-name-${prop.id}`}>{prop.name}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{prop.location}</TableCell>
                            <TableCell className="text-right font-mono">{prop.roomCount}</TableCell>
                            <TableCell className="text-right font-mono">${prop.startAdr}</TableCell>
                            <TableCell className="text-right font-mono">{((prop.baseManagementFeeRate ?? 0) * 100).toFixed(1)}%</TableCell>
                            <TableCell className="text-right font-mono">{((prop.exitCapRate ?? 0) * 100).toFixed(1)}%</TableCell>
                            <TableCell className="text-center">
                              {prop.hasResearchValues ? <IconCheckCircle2 className="w-4 h-4 text-primary mx-auto" /> : <IconXCircle className="w-4 h-4 text-destructive/80 mx-auto" />}
                            </TableCell>
                            <TableCell className="text-center font-mono">{prop.feeCategories?.length ?? 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-accent-pop/10 border border-accent-pop/20 shadow-sm" data-testid="card-populate-production">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2 text-accent-pop">
            <IconUpload className="w-5 h-5 text-accent-pop" /> Populate Production
          </CardTitle>
          <CardDescription className="label-text text-accent-pop/80">
            Push development seed values to the production database. Only fills in values that are <strong>not already set</strong> by a user — existing data is never overwritten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => setSyncConfirmOpen(true)}
            disabled={executeSyncMutation.isPending}
            className="bg-accent-pop/10 border-accent-pop/30 hover:bg-accent-pop/20 text-accent-pop"
            data-testid="button-sync-database"
          >
            {executeSyncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconUpload className="w-4 h-4 mr-2" />}
            Fill Missing Values
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-chart-1/10 border border-chart-1/20 shadow-sm" data-testid="card-canonical-sync">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2 text-foreground">
            <IconShield className="w-5 h-5" /> Sync Canonical Data
          </CardTitle>
          <CardDescription className="label-text text-muted-foreground">
            Enforce canonical database state: correct user roles and groups, clean orphaned records, fix fee category rates, and remove test/duplicate scenarios. Safe to run at any time — protects all legitimate user data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            onClick={() => setCanonicalConfirmOpen(true)}
            disabled={canonicalSyncMutation.isPending}
            className="bg-muted border-chart-1/30 hover:bg-muted text-chart-1"
            data-testid="button-canonical-sync"
          >
            {canonicalSyncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconShield className="w-4 h-4 mr-2" />}
            Sync Now
          </Button>

          {canonicalResult && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
              <div className="bg-chart-1/15 rounded-xl p-3 text-center" data-testid="stat-users-fixed">
                <p className="text-xl font-bold text-chart-1">{canonicalResult.usersFixed ?? 0}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Users Fixed</p>
              </div>
              <div className="bg-chart-1/15 rounded-xl p-3 text-center" data-testid="stat-orphans-deleted">
                <p className="text-xl font-bold text-chart-1">{(canonicalResult.orphanedFeeCategoriesDeleted ?? 0) + (canonicalResult.orphanedResearchDeleted ?? 0)}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Orphans Cleaned</p>
              </div>
              <div className="bg-chart-1/15 rounded-xl p-3 text-center" data-testid="stat-scenarios-cleaned">
                <p className="text-xl font-bold text-chart-1">{canonicalResult.scenariosCleaned ?? 0}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Scenarios Cleaned</p>
              </div>
              <div className="bg-chart-1/15 rounded-xl p-3 text-center" data-testid="stat-fees-fixed">
                <p className="text-xl font-bold text-chart-1">{canonicalResult.feeCategoriesFixed ?? 0}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Fee Cats Fixed</p>
              </div>
              <div className="bg-chart-1/15 rounded-xl p-3 text-center" data-testid="stat-sync-status">
                <p className="text-xl font-bold text-primary">
                  {(canonicalResult.usersFixed ?? 0) + (canonicalResult.orphanedFeeCategoriesDeleted ?? 0) +
                    (canonicalResult.orphanedResearchDeleted ?? 0) + (canonicalResult.scenariosCleaned ?? 0) +
                    (canonicalResult.feeCategoriesFixed ?? 0) === 0 ? "Clean" : "Fixed"}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">Status</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={canonicalConfirmOpen} onOpenChange={setCanonicalConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconShield className="w-4 h-4 text-muted-foreground" /> Confirm Canonical Sync
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">This will enforce the canonical database state:</span>
              <span className="block text-xs pl-2">- Correct user roles and group assignments</span>
              <span className="block text-xs pl-2">- Remove orphaned fee categories and market research</span>
              <span className="block text-xs pl-2">- Clean up test and duplicate scenarios</span>
              <span className="block text-xs pl-2">- Enforce canonical fee category rates</span>
              <span className="block mt-2 font-medium">User data, properties, financials, and legitimate scenarios are never modified.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCanonicalConfirmOpen(false)} data-testid="button-cancel-canonical">Cancel</Button>
            <Button
              onClick={() => canonicalSyncMutation.mutate()}
              disabled={canonicalSyncMutation.isPending}
              className="bg-chart-1 hover:bg-chart-1 text-white"
              data-testid="button-confirm-canonical"
            >
              {canonicalSyncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconShield className="w-4 h-4 mr-2" />}
              Yes, Sync Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={syncConfirmOpen} onOpenChange={setSyncConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconAlertTriangle className="w-5 h-5 text-accent-pop" /> Confirm Production Fill
            </DialogTitle>
            <DialogDescription>
              This will populate global assumptions, properties, fee categories, and design themes with seed values <strong>only where they are currently empty</strong>. Any values already set by users will not be changed. Users and user groups will be created if missing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSyncConfirmOpen(false)} data-testid="button-cancel-sync">Cancel</Button>
            <Button
              onClick={() => executeSyncMutation.mutate()}
              disabled={executeSyncMutation.isPending}
              className="bg-accent-pop hover:bg-accent-pop/80 text-white"
              data-testid="button-confirm-sync"
            >
              {executeSyncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Yes, Fill Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}