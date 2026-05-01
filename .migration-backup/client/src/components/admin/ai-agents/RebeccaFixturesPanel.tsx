import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  IconBookmark, IconPlay, IconTrash, IconHistory, IconRefreshCw,
  IconDownload, IconUpload,
} from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RebeccaSettings } from "@shared/rebecca-settings";

export type FixtureTurn = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

export type RebeccaFixtureReplayStatus = "pass" | "drifted" | "errored" | "skipped";

export type RebeccaFixture = {
  id: number;
  name: string;
  description: string | null;
  settings: RebeccaSettings;
  turns: FixtureTurn[];
  createdAt: string;
  updatedAt: string;
  // Task #559 — populated by the scheduled fixture-replay job
  // (server/jobs/rebecca-fixture-replay.ts). Null until the first
  // automated cycle runs against this fixture.
  lastReplayAt: string | null;
  lastReplayStatus: RebeccaFixtureReplayStatus | null;
  lastReplaySummary: {
    totalTurns: number;
    matched: number;
    differed: number;
    noBaseline: number;
    errored: number;
    durationMs: number;
  } | null;
};

type ReplayResult = {
  // Aligned with the fixture's user-turn indices.
  userIndex: number;
  prompt: string;
  expected: string | null; // assistant content from the fixture (if any)
  actual: string | null;   // assistant content from this replay
  error?: string;
};

interface RebeccaFixturesPanelProps {
  /** Current (unsaved) settings — what replay sends to /api/chat. */
  currentSettings: RebeccaSettings;
  /** Current preview transcript turns the admin might want to save. */
  currentTurns: FixtureTurn[];
  displayName: string;
  /** Called when admin chooses "Load fixture settings" so the parent can
   * apply the snapshot to the live editor (also clears the live transcript
   * because settings changed). */
  onLoadSettings: (settings: RebeccaSettings) => void;
}

export function RebeccaFixturesPanel({
  currentSettings,
  currentTurns,
  displayName,
  onLoadSettings,
}: RebeccaFixturesPanelProps) {
  const { toast } = useToast();
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [activeReplay, setActiveReplay] = useState<{
    fixture: RebeccaFixture;
    results: ReplayResult[];
    running: boolean;
  } | null>(null);
  // Task #560 — import file picker + duplicate-name conflict modal state.
  // The pending import is held client-side so when the admin picks "rename"
  // or "overwrite" we can re-POST the same payload with the chosen
  // resolution without re-reading the file.
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [conflict, setConflict] = useState<{
    payload: unknown;
    conflictName: string;
    renameValue: string;
  } | null>(null);

  const fixturesQuery = useQuery<RebeccaFixture[]>({
    queryKey: ["/api/rebecca/fixtures"],
  });

  const userTurnCount = useMemo(
    () => currentTurns.filter((t) => t.role === "user").length,
    [currentTurns],
  );

  const saveMutation = useMutation({
    mutationFn: async (input: { name: string; description: string; settings: RebeccaSettings; turns: FixtureTurn[] }) => {
      const res = await apiRequest("POST", "/api/rebecca/fixtures", {
        name: input.name,
        description: input.description || undefined,
        settings: input.settings,
        turns: input.turns,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rebecca/fixtures"] });
      toast({ title: "Fixture saved", description: `"${saveName}" is ready to replay.` });
      setSaveOpen(false);
      setSaveName("");
      setSaveDescription("");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast({ title: "Couldn't save fixture", description: msg, variant: "destructive" });
    },
  });

  // Task #560 — POST the parsed JSON envelope to /import. The mutation
  // handles three outcomes: success (toast + invalidate), 409 conflict
  // (open the rename/overwrite modal), or any other error (toast).
  // apiRequest throws `${status}: ${body}` on !ok; we re-parse the body
  // so we can detect the duplicate-name conflict shape.
  const importMutation = useMutation({
    mutationFn: async (input: {
      payload: unknown;
      conflictResolution?: "overwrite" | { renameTo: string };
    }) => {
      try {
        const res = await apiRequest("POST", "/api/rebecca/fixtures/import", input);
        return (await res.json()) as { fixture: RebeccaFixture; mode: "create" | "overwrite" };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // Format from queryClient.throwIfResNotOk: `${status}: ${body}`.
        const match = /^(\d+):\s*([\s\S]*)$/.exec(msg);
        if (match) {
          const status = Number(match[1]);
          let body: { error?: string; code?: string; conflictName?: string } = {};
          try { body = JSON.parse(match[2]); } catch { /* non-JSON body */ }
          const err = new Error(body.error ?? msg) as Error & {
            status?: number;
            code?: string;
            conflictName?: string;
          };
          err.status = status;
          err.code = body.code;
          err.conflictName = body.conflictName;
          throw err;
        }
        throw e;
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/rebecca/fixtures/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rebecca/fixtures"] });
      toast({ title: "Fixture deleted" });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Delete failed";
      toast({ title: "Couldn't delete fixture", description: msg, variant: "destructive" });
    },
  });

  const handleOpenSave = () => {
    if (currentTurns.length === 0 || userTurnCount === 0) {
      toast({
        title: "Nothing to save yet",
        description: "Send at least one preview message before saving as a fixture.",
        variant: "destructive",
      });
      return;
    }
    // Suggest a default name from the first user message — admins can edit.
    const firstUser = currentTurns.find((t) => t.role === "user");
    const suggested = firstUser
      ? firstUser.content.slice(0, 60).trim()
      : "Untitled fixture";
    setSaveName(suggested);
    setSaveDescription("");
    setSaveOpen(true);
  };

  // Task #560 — download a fixture as JSON. We fetch with credentials
  // (the route is admin-gated) and trigger a hidden anchor click on the
  // resulting blob. Filename comes from the server's Content-Disposition
  // when present, falling back to a slug of the fixture name.
  const handleExport = async (fixture: RebeccaFixture) => {
    try {
      const res = await fetch(`/api/rebecca/fixtures/${fixture.id}/export`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const cdMatch = /filename="([^"]+)"/.exec(cd);
      const fallback = `rebecca-fixture-${fixture.id}.json`;
      const filename = cdMatch?.[1] ?? fallback;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Fixture exported", description: filename });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Export failed";
      toast({ title: "Couldn't export fixture", description: msg, variant: "destructive" });
    }
  };

  // Task #560 — import handler. Pipes through the conflict-resolution
  // dance: the first call carries no resolution; if the server returns
  // 409 with `code: "duplicate_name"`, we open the conflict modal
  // pre-populated with the original name and let the admin pick a new
  // name or overwrite. The same `payload` is held in state so the
  // follow-up call doesn't need to re-read the file.
  const runImport = async (
    payload: unknown,
    conflictResolution?: "overwrite" | { renameTo: string },
  ) => {
    setImporting(true);
    try {
      const result = await importMutation.mutateAsync({ payload, conflictResolution });
      queryClient.invalidateQueries({ queryKey: ["/api/rebecca/fixtures"] });
      toast({
        title: result.mode === "overwrite" ? "Fixture overwritten" : "Fixture imported",
        description: `"${result.fixture.name}" is ready to replay.`,
      });
      setConflict(null);
      return true;
    } catch (e: unknown) {
      const err = e as Error & { status?: number; code?: string; conflictName?: string };
      if (err.status === 409 && err.code === "duplicate_name" && err.conflictName) {
        setConflict({
          payload,
          conflictName: err.conflictName,
          renameValue: `${err.conflictName} (imported)`.slice(0, 120),
        });
        return false;
      }
      toast({
        title: "Couldn't import fixture",
        description: err.message ?? "Import failed",
        variant: "destructive",
      });
      setConflict(null);
      return false;
    } finally {
      setImporting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input value so the same file can be picked again later.
    if (importInputRef.current) importInputRef.current.value = "";
    if (!file) return;

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      toast({
        title: "Couldn't read file",
        description: "Selected file isn't valid JSON.",
        variant: "destructive",
      });
      return;
    }
    await runImport(parsed);
  };

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      name,
      description: saveDescription.trim(),
      settings: currentSettings,
      turns: currentTurns,
    });
  };

  const runReplay = async (fixture: RebeccaFixture) => {
    const userTurns = fixture.turns.filter((t) => t.role === "user");
    if (userTurns.length === 0) {
      toast({
        title: "Nothing to replay",
        description: "This fixture has no user turns.",
        variant: "destructive",
      });
      return;
    }

    setActiveReplay({ fixture, results: [], running: true });

    // Walk the saved transcript in order. For each user turn, send the
    // accumulated history (built from THIS replay's responses, not the
    // fixture's, so the new run is internally consistent) plus the user
    // prompt to /api/chat with the current unsaved settings.
    const history: { role: "user" | "assistant"; content: string }[] = [];
    const results: ReplayResult[] = [];
    let userIndex = -1;

    for (let i = 0; i < fixture.turns.length; i++) {
      const turn = fixture.turns[i];
      if (turn.role !== "user") continue;
      userIndex++;

      // Find the Rebecca reply that immediately followed this user turn in
      // the fixture (if any) — that's the baseline answer we'll diff against.
      const expectedTurn = fixture.turns
        .slice(i + 1)
        .find((t, idx) => idx === 0 && t.role === "assistant");
      const expected = expectedTurn?.content ?? null;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: turn.content,
            history: [...history],
            newConversation: true,
            responseMode: "standard",
            previewSettings: currentSettings,
            preview: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const actual = data.response ?? "";
        const result: ReplayResult = {
          userIndex,
          prompt: turn.content,
          expected,
          actual,
        };
        results.push(result);
        history.push({ role: "user", content: turn.content });
        history.push({ role: "assistant", content: actual });
        // Push an updated snapshot so the user sees turn-by-turn progress.
        setActiveReplay({ fixture, results: [...results], running: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({
          userIndex,
          prompt: turn.content,
          expected,
          actual: null,
          error: msg,
        });
        setActiveReplay({ fixture, results: [...results], running: true });
        // Stop on first error — subsequent turns depend on prior context
        // and would just compound the failure.
        toast({
          title: "Replay turn failed",
          description: msg,
          variant: "destructive",
        });
        break;
      }
    }
    setActiveReplay((prev) => (prev ? { ...prev, running: false } : null));
  };

  const closeReplay = () => setActiveReplay(null);

  const fixtures = fixturesQuery.data ?? [];

  return (
    <div className="space-y-3" data-testid="panel-rebecca-fixtures">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <IconBookmark className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Saved fixtures</h4>
          <Badge variant="outline" className="text-[10px]" data-testid="badge-fixture-count">
            {fixtures.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Hidden file input — the visible button below proxies clicks to it. */}
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
            data-testid="input-import-fixture-file"
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            data-testid="button-import-fixture"
            title="Import a fixture exported from another environment"
          >
            <IconUpload className="w-3.5 h-3.5" />
            {importing ? "Importing…" : "Import fixture"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={handleOpenSave}
            disabled={userTurnCount === 0}
            data-testid="button-save-fixture"
          >
            <IconBookmark className="w-3.5 h-3.5" />
            Save current as fixture
          </Button>
        </div>
      </div>

      {fixturesQuery.isLoading && (
        <p className="text-[11px] text-muted-foreground/70 italic" data-testid="text-fixtures-loading">
          Loading fixtures…
        </p>
      )}

      {!fixturesQuery.isLoading && fixtures.length === 0 && (
        <div
          className="p-3 rounded-lg border border-dashed border-border/60 text-[11px] text-muted-foreground/70 leading-relaxed"
          data-testid="text-fixtures-empty"
        >
          No saved fixtures yet. Build a preview transcript above, then click
          <span className="font-medium"> Save current as fixture</span> to pin it
          as a regression sample you can replay against future configs.
        </div>
      )}

      {fixtures.length > 0 && (
        <ul className="space-y-2" data-testid="list-fixtures">
          {fixtures.map((f) => {
            const turnCount = f.turns.length;
            const userCount = f.turns.filter((t) => t.role === "user").length;
            return (
              <li
                key={f.id}
                className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2"
                data-testid={`row-fixture-${f.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" data-testid={`text-fixture-name-${f.id}`}>{f.name}</p>
                    {f.description && (
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-2">{f.description}</p>
                    )}
                    <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
                      {turnCount} turn{turnCount === 1 ? "" : "s"} · {userCount} prompt{userCount === 1 ? "" : "s"} ·
                      {" "}{new Date(f.createdAt).toLocaleDateString()}
                    </p>
                    {f.lastReplayStatus && f.lastReplayAt && (
                      <p
                        className={`text-[10px] font-mono mt-1 ${
                          f.lastReplayStatus === "pass"
                            ? "text-green-600 dark:text-green-400"
                            : f.lastReplayStatus === "drifted"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-red-600 dark:text-red-400"
                        }`}
                        data-testid={`text-fixture-last-replay-${f.id}`}
                        title={
                          f.lastReplaySummary
                            ? `Auto-replay: ${f.lastReplaySummary.matched} pass, ${f.lastReplaySummary.differed} differ, ${f.lastReplaySummary.errored} error of ${f.lastReplaySummary.totalTurns}`
                            : "Auto-replay status"
                        }
                      >
                        Auto-replay {f.lastReplayStatus}
                        {f.lastReplaySummary
                          ? ` (${f.lastReplaySummary.matched}/${f.lastReplaySummary.totalTurns} pass)`
                          : ""}
                        {" · "}{new Date(f.lastReplayAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => runReplay(f)}
                      disabled={activeReplay?.running}
                      data-testid={`button-replay-fixture-${f.id}`}
                    >
                      <IconPlay className="w-3.5 h-3.5" /> Replay
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => onLoadSettings(f.settings)}
                      data-testid={`button-load-fixture-settings-${f.id}`}
                      title="Replace the editor with this fixture's settings"
                    >
                      <IconHistory className="w-3.5 h-3.5" /> Load settings
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => handleExport(f)}
                      data-testid={`button-export-fixture-${f.id}`}
                      title="Download this fixture as JSON to share with another environment"
                    >
                      <IconDownload className="w-3.5 h-3.5" /> Export
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (window.confirm(`Delete fixture "${f.name}"?`)) {
                          deleteMutation.mutate(f.id);
                        }
                      }}
                      data-testid={`button-delete-fixture-${f.id}`}
                      title="Delete fixture"
                    >
                      <IconTrash className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent data-testid="dialog-save-fixture">
          <DialogHeader>
            <DialogTitle>Save preview as fixture</DialogTitle>
            <DialogDescription>
              Snapshots the current settings and the {currentTurns.length}-turn
              preview transcript so you can replay it later against changed
              settings and compare answers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Name</Label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                maxLength={120}
                placeholder="e.g. Conservative tone — portfolio summary"
                data-testid="input-fixture-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Description (optional)</Label>
              <Textarea
                rows={3}
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                maxLength={500}
                placeholder="What this fixture verifies, e.g. 'Rebecca should still recommend Buenavista when warmth=80, formality=30.'"
                data-testid="input-fixture-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)} data-testid="button-cancel-save-fixture">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !saveName.trim()}
              data-testid="button-confirm-save-fixture"
            >
              {saveMutation.isPending ? "Saving…" : "Save fixture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task #560 — duplicate-name conflict resolution modal. Shown when
          /import returns 409. Admin can pick a new name (defaults to
          "<original> (imported)") or overwrite the existing fixture in
          place. Both options re-POST the same payload with the chosen
          conflictResolution. */}
      <Dialog
        open={!!conflict}
        onOpenChange={(o) => { if (!o && !importing) setConflict(null); }}
      >
        <DialogContent data-testid="dialog-import-conflict">
          {conflict && (
            <>
              <DialogHeader>
                <DialogTitle>Fixture name already exists</DialogTitle>
                <DialogDescription>
                  A fixture named <span className="font-mono font-semibold">{conflict.conflictName}</span> already
                  exists. Rename the imported fixture, or overwrite the existing one in place.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">New name</Label>
                  <Input
                    value={conflict.renameValue}
                    onChange={(e) =>
                      setConflict((c) => (c ? { ...c, renameValue: e.target.value } : c))
                    }
                    maxLength={120}
                    data-testid="input-import-rename"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground/80">
                  Overwriting replaces this existing fixture's saved settings, transcript, and
                  description with the imported snapshot. The fixture's name and any scheduled-replay
                  history reset.
                </p>
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setConflict(null)}
                  disabled={importing}
                  data-testid="button-cancel-import-conflict"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => runImport(conflict.payload, "overwrite")}
                  disabled={importing}
                  data-testid="button-import-overwrite"
                >
                  {importing ? "Working…" : "Overwrite existing"}
                </Button>
                <Button
                  onClick={() => {
                    const renameTo = conflict.renameValue.trim();
                    if (!renameTo) {
                      toast({ title: "New name is required", variant: "destructive" });
                      return;
                    }
                    if (renameTo === conflict.conflictName) {
                      toast({
                        title: "Pick a different name",
                        description: "The new name must differ from the existing fixture's name.",
                        variant: "destructive",
                      });
                      return;
                    }
                    runImport(conflict.payload, { renameTo });
                  }}
                  disabled={importing}
                  data-testid="button-import-rename"
                >
                  {importing ? "Working…" : "Import with new name"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Replay results dialog */}
      <Dialog open={!!activeReplay} onOpenChange={(o) => { if (!o) closeReplay(); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="dialog-replay-results">
          {activeReplay && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Replay diff — <span className="font-mono text-sm">{activeReplay.fixture.name}</span>
                  {activeReplay.running && <IconRefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
                </DialogTitle>
                <DialogDescription>
                  Re-ran the saved prompts through {displayName || "Rebecca"}'s
                  current (unsaved) settings. Compare each turn below.
                </DialogDescription>
              </DialogHeader>

              <ReplaySummary results={activeReplay.results} running={activeReplay.running} />

              <div className="space-y-4">
                {activeReplay.results.map((r) => (
                  <ReplayTurnDiff key={r.userIndex} result={r} />
                ))}
                {activeReplay.running && activeReplay.results.length === 0 && (
                  <p className="text-xs text-muted-foreground italic" data-testid="text-replay-warming">
                    Sending first prompt…
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={closeReplay} data-testid="button-close-replay">
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReplaySummary({ results, running }: { results: ReplayResult[]; running: boolean }) {
  const total = results.length;
  const matched = results.filter((r) => r.actual != null && r.expected != null && r.actual.trim() === r.expected.trim()).length;
  const differed = results.filter((r) => r.actual != null && r.expected != null && r.actual.trim() !== r.expected.trim()).length;
  const missingBaseline = results.filter((r) => r.expected == null && !r.error).length;
  const errors = results.filter((r) => r.error).length;

  if (total === 0) return null;

  return (
    <div
      className="flex items-center flex-wrap gap-2 p-3 rounded-lg bg-muted/30 border border-border/40 text-xs"
      data-testid="replay-summary"
    >
      <Badge variant="outline" className="font-mono" data-testid="badge-replay-total">{total} turn{total === 1 ? "" : "s"}</Badge>
      {matched > 0 && (
        <Badge variant="outline" className="font-mono bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300" data-testid="badge-replay-matched">
          {matched} match
        </Badge>
      )}
      {differed > 0 && (
        <Badge variant="outline" className="font-mono bg-amber-500/10 border-amber-500/40 text-amber-800 dark:text-amber-200" data-testid="badge-replay-differed">
          {differed} differ
        </Badge>
      )}
      {missingBaseline > 0 && (
        <Badge variant="outline" className="font-mono bg-muted/50" data-testid="badge-replay-no-baseline">
          {missingBaseline} no baseline
        </Badge>
      )}
      {errors > 0 && (
        <Badge variant="outline" className="font-mono bg-destructive/10 border-destructive/40 text-destructive" data-testid="badge-replay-errors">
          {errors} error
        </Badge>
      )}
      {running && (
        <span className="text-muted-foreground italic ml-auto">running…</span>
      )}
    </div>
  );
}

function ReplayTurnDiff({ result }: { result: ReplayResult }) {
  const same =
    result.actual != null &&
    result.expected != null &&
    result.actual.trim() === result.expected.trim();

  return (
    <div
      className="rounded-lg border border-border/60 overflow-hidden"
      data-testid={`replay-turn-${result.userIndex}`}
    >
      <div className="px-3 py-2 bg-muted/30 border-b border-border/40 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">Prompt #{result.userIndex + 1}</span>
        {result.error ? (
          <Badge variant="outline" className="text-[10px] bg-destructive/10 border-destructive/40 text-destructive">Error</Badge>
        ) : same ? (
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">Identical</Badge>
        ) : result.expected == null ? (
          <Badge variant="outline" className="text-[10px]">No baseline</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] bg-amber-500/10 border-amber-500/40 text-amber-800 dark:text-amber-200">Differs</Badge>
        )}
      </div>
      <div className="p-3 text-xs whitespace-pre-wrap bg-muted/10 border-b border-border/30">
        <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">You asked</span>
        <p className="mt-1">{result.prompt}</p>
      </div>
      {result.error ? (
        <div className="p-3 text-xs text-destructive bg-destructive/5">{result.error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
          <div className="p-3 text-xs whitespace-pre-wrap" data-testid={`replay-then-${result.userIndex}`}>
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Then (saved)</span>
            <p className="mt-1">{result.expected ?? <em className="text-muted-foreground/70">No saved reply</em>}</p>
          </div>
          <div className="p-3 text-xs whitespace-pre-wrap bg-muted/5" data-testid={`replay-now-${result.userIndex}`}>
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Now (current settings)</span>
            <p className="mt-1">{result.actual ?? <em className="text-muted-foreground/70">No reply</em>}</p>
          </div>
        </div>
      )}
    </div>
  );
}
