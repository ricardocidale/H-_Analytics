import { useState, useEffect, useRef, Suspense } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useScenarioDirtyState } from "@/lib/scenario-dirty-state";
import { UnsavedChangesDialog } from "@/components/scenarios";
import { useAutoSave, useAutoSaveCheck, useLoadScenario } from "@/lib/api/scenarios";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { formatDateTime } from "@/lib/formatters";
import { lazy } from "react";

interface StaleWorkflow {
  id: number;
  workflowKey: string;
  name: string;
  description: string | null;
  lastRunAt: string | null;
  frequencyHours: number;
}

const ScheduledResearchOverlayLazy = lazy(() =>
  import("@/components/research/ScheduledResearchOverlay").then(m => ({ default: m.ScheduledResearchOverlay }))
);

const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

export function GlobalBeforeUnloadGuard() {
  const { isDirty } = useScenarioDirtyState();
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
  return null;
}

export function NavigationGuard() {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const { isDirty } = useScenarioDirtyState();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const prevLocationRef = useRef(location);
  const suppressGuardRef = useRef(false);

  useEffect(() => {
    if (suppressGuardRef.current) {
      suppressGuardRef.current = false;
      prevLocationRef.current = location;
      return;
    }
    if (location !== prevLocationRef.current && isDirty) {
      const newPath = location;
      setLocation(prevLocationRef.current);
      setPendingPath(newPath);
    } else {
      prevLocationRef.current = location;
    }
  }, [location, isDirty, setLocation]);

  const handleDiscard = () => {
    if (pendingPath) {
      suppressGuardRef.current = true;
      setPendingPath(null);
      setLocation(pendingPath);
    }
  };

  const handleStay = () => {
    setPendingPath(null);
  };

  return (
    <UnsavedChangesDialog
      open={!!pendingPath}
      onOpenChange={(v) => { if (!v) handleStay(); }}
      onDiscard={handleDiscard}
      onStay={handleStay}
      context="navigate"
    />
  );
}

export function IdleAutoSave() {
  const { user } = useAuth();
  const autoSave = useAutoSave();
  const { toast } = useToast();
  const lastActivityRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;
    const updateActivity = () => { lastActivityRef.current = Date.now(); };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, updateActivity, { passive: true }));

    timerRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      const { isDirty } = useScenarioDirtyState.getState();
      if (idle >= IDLE_TIMEOUT_MS && isDirty) {
        autoSave.mutate(undefined, {
          onSuccess: () => {
            useScenarioDirtyState.getState().clearDirty();
            toast({ title: "Auto-saved", description: "Your work has been auto-saved." });
          },
        });
        lastActivityRef.current = Date.now();
      }
    }, 60 * 1000);

    return () => {
      events.forEach(e => window.removeEventListener(e, updateActivity));
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user]);

  return null;
}

export function AutoSaveRestorePrompt() {
  const { user } = useAuth();
  const { data: autoSaveCheck, isLoading: _checkLoading } = useAutoSaveCheck(!!user);
  const loadScenario = useLoadScenario();
  const { toast } = useToast();
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (autoSaveCheck?.exists && !dismissed) {
      const sessionKey = `autosave_prompt_${user?.id}`;
      if (!sessionStorage.getItem(sessionKey)) {
        setShowPrompt(true);
      }
    }
  }, [autoSaveCheck, user, dismissed]);

  const handleRestore = async () => {
    try {
      const res = await fetch("/api/scenarios?kind=autosave", { credentials: "include" });
      if (res.ok) {
        const scenarios = await res.json();
        if (scenarios.length > 0) {
          await loadScenario.mutateAsync(scenarios[0].id);
          useScenarioDirtyState.getState().setActiveScenario(scenarios[0].name || "Restored", "autosave");
          useScenarioDirtyState.getState().clearDirty();
          toast({ title: "Restored", description: "Your auto-saved work has been restored." });
        }
      }
    } catch {
      toast({ title: "Error", description: "Failed to restore auto-save.", variant: "destructive" });
    }
    setShowPrompt(false);
    setDismissed(true);
    if (user) sessionStorage.setItem(`autosave_prompt_${user.id}`, "1");
  };

  const handleStartFresh = async () => {
    try {
      await fetch("/api/scenarios/auto-save", { method: "DELETE", credentials: "include" }).catch(() => { /* ignore: auto-save cleanup is best-effort */ });
    } catch {
      // best-effort cleanup — auto-save deletion is non-critical
    }
    setShowPrompt(false);
    setDismissed(true);
    if (user) sessionStorage.setItem(`autosave_prompt_${user.id}`, "1");
  };

  if (!showPrompt || !autoSaveCheck?.exists) return null;

  return (
    <Dialog open={showPrompt} onOpenChange={(v) => { if (!v) handleStartFresh(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Restore Unsaved Work?</DialogTitle>
          <DialogDescription className="label-text">
            You have unsaved work from {autoSaveCheck.updatedAt ? formatDateTime(autoSaveCheck.updatedAt) : "a previous session"}. Would you like to restore it or start fresh?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleStartFresh} data-testid="button-start-fresh">
            Start Fresh
          </Button>
          <Button onClick={handleRestore} disabled={loadScenario.isPending} data-testid="button-restore-autosave">
            {loadScenario.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LogoutProtectionDialog() {
  const { logoutPending, confirmLogout, cancelLogout } = useAuth();

  return (
    <UnsavedChangesDialog
      open={logoutPending}
      onOpenChange={(v) => { if (!v) cancelLogout(); }}
      onDiscard={confirmLogout}
      onStay={cancelLogout}
      context="logout"
    />
  );
}

export function ScheduledResearchGate() {
  const { user } = useAuth();
  const [staleWorkflows, setStaleWorkflows] = useState<StaleWorkflow[]>([]);
  const [show, setShow] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!user || user.role !== "admin" || checkedRef.current) return;
    checkedRef.current = true;

    const sessionKey = `hbg_sched_research_${user.id}`;
    const lastCheck = sessionStorage.getItem(sessionKey);
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    if (lastCheck && parseInt(lastCheck) > fiveMinAgo) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/research/scheduled/check-stale", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.hasStale && data.workflows.length > 0) {
          setStaleWorkflows(data.workflows);
          setShow(true);
        }
        sessionStorage.setItem(sessionKey, String(Date.now()));
      } catch { /* silent */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [user]);

  if (!show || staleWorkflows.length === 0) return null;

  return (
    <Suspense fallback={null}>
      <ScheduledResearchOverlayLazy
        workflows={staleWorkflows}
        onDismiss={() => {
          setShow(false);
          sessionStorage.setItem(`hbg_sched_research_${user?.id}`, String(Date.now()));
        }}
      />
    </Suspense>
  );
}
