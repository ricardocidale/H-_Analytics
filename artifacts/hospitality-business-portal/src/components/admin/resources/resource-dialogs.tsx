import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ResourceSlugSchema, type ResourceKind, type ResourcePublicView } from "@shared/schema";

interface ImpactEntry {
  specialistId: string;
  assignmentKind: string;
  assignmentSlug: string;
  assignmentRole: string | null;
  required: boolean;
}

interface VersionEntry {
  id: number;
  version: number;
  displayName: string;
  description: string | null;
  config: Record<string, unknown>;
  hasSecret: boolean;
  changeSummary: string | null;
  changedByUserId: number | null;
  changedAt: string;
}

function safeJsonParse(s: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!s.trim()) return { ok: true, value: {} };
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return { ok: true, value: v as Record<string, unknown> };
    return { ok: false, error: "config must be a JSON object" };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid JSON" };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Client-side probe URL validation — mirrors ssrf-guard.ts rules without DNS.
// The server enforces the same rules (plus async DNS resolution). We replicate
// the synchronous subset here so the admin gets instant feedback before Save.
// ────────────────────────────────────────────────────────────────────────────

const PROBE_BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

const PROBE_PRIVATE_CIDRS: Array<[number, number]> = [
  [0x0a000000, 0xff000000],   // 10.0.0.0/8
  [0xac100000, 0xfff00000],   // 172.16.0.0/12
  [0xc0a80000, 0xffff0000],   // 192.168.0.0/16
  [0x7f000000, 0xff000000],   // 127.0.0.0/8
  [0xa9fe0000, 0xffff0000],   // 169.254.0.0/16
  [0x00000000, 0xff000000],   // 0.0.0.0/8
];

function ipToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(hostname: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  const n = ipToLong(hostname);
  return PROBE_PRIVATE_CIDRS.some(([base, mask]) => (n & mask) === (base & mask));
}

function isBlockedIPv6(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    h === "::1" ||
    h === "::" ||
    h.startsWith("fe80:") ||
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    h.startsWith("::ffff:")
  );
}

function validateProbeUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "healthProbe.url must be a valid URL";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "healthProbe.url must use http or https";
  }
  const hostname = parsed.hostname;
  if (PROBE_BLOCKED_HOSTS.has(hostname)) {
    return `healthProbe.url cannot point to ${hostname} (blocked host)`;
  }
  if (hostname.endsWith(".internal")) {
    return "healthProbe.url cannot point to an .internal host";
  }
  if (isPrivateIPv4(hostname)) {
    return "healthProbe.url cannot point to a private IP address";
  }
  if (isBlockedIPv6(hostname)) {
    return "healthProbe.url cannot point to a loopback or private IPv6 address";
  }
  return null;
}

function extractProbeUrlError(configJson: string): string | null {
  const parsed = safeJsonParse(configJson);
  if (!parsed.ok) return null;
  const probeObj = parsed.value["healthProbe"];
  if (!probeObj || typeof probeObj !== "object" || Array.isArray(probeObj)) return null;
  const url = (probeObj as Record<string, unknown>)["url"];
  if (url === undefined || url === null || url === "") return null;
  if (typeof url !== "string") return "healthProbe.url must be a string";
  return validateProbeUrl(url);
}

// ────────────────────────────────────────────────────────────────────────────
// Create dialog
// ────────────────────────────────────────────────────────────────────────────
export function CreateResourceDialog({
  kind, open, onOpenChange,
}: { kind: ResourceKind; open: boolean; onOpenChange: (b: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [configJson, setConfigJson] = useState("{}");
  const [error, setError] = useState<string | null>(null);

  const probeUrlError = useMemo(() => extractProbeUrlError(configJson), [configJson]);

  useEffect(() => {
    if (open) {
      setSlug(""); setDisplayName(""); setDescription(""); setSecretRef(""); setConfigJson("{}"); setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const slugCheck = ResourceSlugSchema.safeParse(slug);
      if (!slugCheck.success) throw new Error(slugCheck.error.issues[0].message);
      if (!displayName.trim()) throw new Error("Display name is required");
      const cfg = safeJsonParse(configJson);
      if (!cfg.ok) throw new Error(`config: ${cfg.error}`);
      const trimmedSecret = secretRef.trim();
      const body = {
        kind, slug, displayName, description: description || null,
        secretRef: trimmedSecret.length > 0 ? trimmedSecret : null,
        config: cfg.value,
      };
      const res = await apiRequest("POST", "/api/admin/resources", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources", kind] });
      // The Resources tab now reads from the transparency endpoint and the
      // gaps banner from /gaps — refresh both so a freshly-created resource
      // shows up immediately without waiting for the periodic refetch.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources/transparency", kind] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources/gaps", kind] });
      toast({ title: "Resource created" });
      onOpenChange(false);
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Create failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`dialog-create-${kind}`}>
        <DialogHeader>
          <DialogTitle>Create new {kind}</DialogTitle>
          <DialogDescription>
            Slugs are kebab-case and stable across deploys; the catalog uses them as the wiring key.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="create-slug">Slug</Label>
            <Input id="create-slug" data-testid="input-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. fred, openai-gpt-5" />
          </div>
          <div>
            <Label htmlFor="create-display">Display name</Label>
            <Input id="create-display" data-testid="input-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="create-desc">Description</Label>
            <Textarea id="create-desc" data-testid="input-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="create-secret">Secret reference (env var name)</Label>
            <Input id="create-secret" data-testid="input-secret-ref" value={secretRef} onChange={(e) => setSecretRef(e.target.value)} placeholder="e.g. FRED_API_KEY (leave blank if none)" />
            <p className="text-xs text-muted-foreground mt-1">We never store the secret value here — only its key name.</p>
          </div>
          <div>
            <Label htmlFor="create-config">Config (JSON)</Label>
            <Textarea id="create-config" data-testid="input-config" rows={5} value={configJson} onChange={(e) => setConfigJson(e.target.value)} className="font-mono text-xs" />
            {probeUrlError && (
              <p className="text-xs text-amber-600 mt-1 flex items-start gap-1" data-testid="probe-url-warning">
                <span aria-hidden>⚠</span>
                <span>{probeUrlError}</span>
              </p>
            )}
          </div>
          {error && <p className="text-sm text-rose-600" data-testid="create-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-testid="button-confirm-create" onClick={() => mutation.mutate()} disabled={mutation.isPending || !!probeUrlError}>
            {mutation.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Edit dialog (versioned save + impact list panel)
// ────────────────────────────────────────────────────────────────────────────
export function EditResourceDialog({
  resource, open, onOpenChange,
}: { resource: ResourcePublicView | null; open: boolean; onOpenChange: (b: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [configJson, setConfigJson] = useState("{}");
  const [changeSummary, setChangeSummary] = useState("");
  const [error, setError] = useState<string | null>(null);

  const probeUrlError = useMemo(() => extractProbeUrlError(configJson), [configJson]);

  useEffect(() => {
    if (resource && open) {
      setDisplayName(resource.displayName);
      setDescription(resource.description ?? "");
      setSecretRef(""); // blank = leave unchanged
      setConfigJson(JSON.stringify(resource.config ?? {}, null, 2));
      setChangeSummary("");
      setError(null);
    }
  }, [resource, open]);

  const { data: impact, isLoading: impactLoading, isError: impactError } = useQuery<ImpactEntry[]>({
    queryKey: [`/api/admin/resources/${resource?.id}/impact`],
    enabled: open && !!resource,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!resource) throw new Error("No resource selected");
      if (!displayName.trim()) throw new Error("Display name is required");
      if (!changeSummary.trim()) throw new Error("Please describe what changed (for the version history)");
      const cfg = safeJsonParse(configJson);
      if (!cfg.ok) throw new Error(`config: ${cfg.error}`);
      const body: Record<string, unknown> = {
        displayName,
        description: description || null,
        config: cfg.value,
        changeSummary,
      };
      if (secretRef.trim()) body.secretRef = secretRef.trim();
      const res = await apiRequest("PUT", `/api/admin/resources/${resource.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources", resource?.kind] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources/transparency", resource?.kind] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources/gaps", resource?.kind] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${resource?.id}/impact`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${resource?.id}/versions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${resource?.id}/health`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${resource?.id}/transparency`] });
      toast({ title: "Resource updated", description: "A new version was recorded." });
      onOpenChange(false);
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Update failed"),
  });

  if (!resource) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid={`dialog-edit-${resource.id}`}>
        <DialogHeader>
          <DialogTitle>Edit {resource.kind} · {resource.slug}</DialogTitle>
          <DialogDescription>
            Editing creates a new version (currently v{resource.version}). The slug is immutable.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-3">
            <div>
              <Label htmlFor="edit-display">Display name</Label>
              <Input id="edit-display" data-testid="input-edit-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea id="edit-desc" data-testid="input-edit-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-secret">Secret reference (env var name)</Label>
              <Input
                id="edit-secret"
                data-testid="input-edit-secret-ref"
                value={secretRef}
                onChange={(e) => setSecretRef(e.target.value)}
                placeholder={resource.hasSecret ? "(leave blank to keep current)" : "(none)"}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {resource.hasSecret ? "A secret is currently set. Leave blank to keep it; type a new env-var name to replace." : "No secret currently set. Optional."}
              </p>
            </div>
            <div>
              <Label htmlFor="edit-config">Config (JSON)</Label>
              <Textarea id="edit-config" data-testid="input-edit-config" rows={6} value={configJson} onChange={(e) => setConfigJson(e.target.value)} className="font-mono text-xs" />
              {probeUrlError && (
                <p className="text-xs text-amber-600 mt-1 flex items-start gap-1" data-testid="probe-url-warning">
                  <span aria-hidden>⚠</span>
                  <span>{probeUrlError}</span>
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-change-summary">Change summary <span className="text-rose-600">*</span></Label>
              <Input
                id="edit-change-summary"
                data-testid="input-change-summary"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="What changed and why?"
              />
            </div>
            {error && <p className="text-sm text-rose-600" data-testid="edit-error">{error}</p>}
          </div>
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Impact</Label>
            <div className="border rounded-md p-2 mt-1 max-h-72 overflow-y-auto" data-testid={`impact-list-${resource.id}`}>
              {impactLoading ? (
                <p className="text-xs text-muted-foreground p-2">Loading impact…</p>
              ) : impactError ? (
                <p className="text-xs text-rose-600 p-2" data-testid={`impact-error-${resource.id}`}>
                  Couldn't load impact list. Save with caution — Specialists may still reference this resource.
                </p>
              ) : !impact || impact.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">No Specialists currently reference this resource.</p>
              ) : (
                <ul className="space-y-1">
                  {impact.map((e) => (
                    <li key={`${e.specialistId}-${e.assignmentKind}-${e.assignmentSlug}-${e.assignmentRole ?? ""}`}
                        className="text-xs flex items-center justify-between gap-2"
                        data-testid={`impact-row-${e.specialistId}`}>
                      <span className="font-mono">{e.specialistId}</span>
                      <span className="flex items-center gap-1">
                        {e.assignmentRole && <Badge variant="outline" className="text-[10px]">{e.assignmentRole}</Badge>}
                        {e.required && <Badge variant="secondary" className="text-[10px]">required</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-testid="button-confirm-edit" onClick={() => mutation.mutate()} disabled={mutation.isPending || !!probeUrlError}>
            {mutation.isPending ? "Saving…" : `Save as v${resource.version + 1}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Version history + rollback
// ────────────────────────────────────────────────────────────────────────────
export function VersionHistoryDialog({
  resource, open, onOpenChange,
}: { resource: ResourcePublicView | null; open: boolean; onOpenChange: (b: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);

  const { data: versions = [], isLoading } = useQuery<VersionEntry[]>({
    queryKey: [`/api/admin/resources/${resource?.id}/versions`],
    enabled: open && !!resource,
  });

  const sortedVersions = useMemo(() => [...versions].sort((a, b) => b.version - a.version), [versions]);

  const rollbackMutation = useMutation({
    mutationFn: async (targetVersion: number) => {
      if (!resource) throw new Error("No resource");
      const res = await apiRequest("POST", `/api/admin/resources/${resource.id}/rollback`, { targetVersion });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources", resource?.kind] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources/transparency", resource?.kind] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources/gaps", resource?.kind] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${resource?.id}/versions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${resource?.id}/transparency`] });
      toast({ title: "Rolled back", description: "A new version was recorded with the prior contents." });
      setRollbackTarget(null);
      onOpenChange(false);
    },
    onError: (err: unknown) => toast({
      title: "Rollback failed",
      description: err instanceof Error ? err.message : "Unknown error",
      variant: "destructive",
    }),
  });

  if (!resource) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl" data-testid={`dialog-history-${resource.id}`}>
          <DialogHeader>
            <DialogTitle>History · {resource.kind}/{resource.slug}</DialogTitle>
            <DialogDescription>
              Each save records a new version. Rollback creates a fresh version equal to the chosen snapshot.
            </DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sortedVersions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Changed at</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedVersions.map((v) => (
                  <TableRow key={v.id} data-testid={`version-row-${v.version}`}>
                    <TableCell className="font-mono">v{v.version}</TableCell>
                    <TableCell className="text-xs">{new Date(v.changedAt).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{v.changeSummary ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {v.version < resource.version && (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`button-rollback-${v.version}`}
                          onClick={() => setRollbackTarget(v.version)}
                        >
                          Rollback to v{v.version}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={rollbackTarget !== null} onOpenChange={(o) => !o && setRollbackTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm rollback to v{rollbackTarget}</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new version (v{resource.version + 1}) whose contents equal v{rollbackTarget}. The prior version is preserved in history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-rollback"
              onClick={() => rollbackTarget !== null && rollbackMutation.mutate(rollbackTarget)}
            >
              Confirm rollback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Delete confirm
// ────────────────────────────────────────────────────────────────────────────
export function DeleteResourceDialog({
  resource, open, onOpenChange,
}: { resource: ResourcePublicView | null; open: boolean; onOpenChange: (b: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: impact, isLoading: impactLoading, isError: impactError } = useQuery<ImpactEntry[]>({
    queryKey: [`/api/admin/resources/${resource?.id}/impact`],
    enabled: open && !!resource,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!resource) throw new Error("No resource");
      await apiRequest("DELETE", `/api/admin/resources/${resource.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources", resource?.kind] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources/transparency", resource?.kind] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources/gaps", resource?.kind] });
      toast({ title: "Resource deleted" });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast({
      title: "Delete failed",
      description: err instanceof Error ? err.message : "Unknown error",
      variant: "destructive",
    }),
  });

  if (!resource) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={`dialog-delete-${resource.id}`}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {resource.kind}/{resource.slug}?</AlertDialogTitle>
          <AlertDialogDescription>
            {impactLoading ? (
              "Checking impact…"
            ) : impactError ? (
              <span className="text-rose-600" data-testid={`delete-impact-error-${resource.id}`}>
                Couldn't load impact list — Specialists may still reference this resource. Proceed with caution.
              </span>
            ) : impact && impact.length > 0 ? (
              <span className="text-rose-600">
                Warning: {impact.length} Specialist{impact.length === 1 ? "" : "s"} reference this resource. Deleting will leave them unwired until the catalog is updated.
              </span>
            ) : (
              "No Specialists currently reference this resource."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid="button-confirm-delete"
            className="bg-rose-600 hover:bg-rose-700"
            onClick={() => mutation.mutate()}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
