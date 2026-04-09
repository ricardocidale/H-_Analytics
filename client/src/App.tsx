/**
 * App.tsx — Root component and routing hub for the hospitality business simulation platform.
 *
 * This file wires together the top-level React providers (React Query, Auth, Tooltips,
 * Toasts) and declares every client-side route in the application.
 *
 * Key architectural decisions:
 *   • All page components (except Login and NotFound) are lazy-loaded so the initial
 *     bundle stays small. Each page is wrapped in <Suspense> with a spinner fallback.
 *   • Four route-guard wrappers enforce role-based access:
 *       – ProtectedRoute: any authenticated user
 *       – AdminRoute: admin role only
 *       – ManagementRoute: any role except "investor"
 *       – CheckerRoute: admin or checker roles
 *   • Financial pages are additionally wrapped in <FinancialErrorBoundary> so a
 *     calculation error in one page doesn't crash the whole app.
 *   • On first login each session, a <ResearchRefreshOverlay> triggers a background
 *     refresh of cached AI research data so dashboards show up-to-date content.
 *   • Several legacy routes (e.g. /sensitivity, /financing, /map) redirect to their
 *     new consolidated locations.
 */
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { lazy, Suspense, useState, useEffect, useCallback, useRef } from "react";
import { setAdminSection as setAdminSectionFn } from "@/lib/admin-nav";
import {
  ErrorBoundary,
  FinancialErrorBoundary,
} from "@/components/ErrorBoundary";
import { Loader2 } from "@/components/icons/themed-icons";
import NotFound from "@/pages/not-found";
import { initClientSentry, setClientUser, Sentry } from "@/lib/sentry";
import { initAnalytics, identifyUser, trackUserLogin } from "@/lib/analytics";
import { UserRole } from "@shared/constants";
import { useScenarioDirtyState } from "@/lib/scenario-dirty-state";
import { UnsavedChangesDialog } from "@/components/scenarios";
import { useAutoSave, useAutoSaveCheck, useLoadScenario } from "@/lib/api/scenarios";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/formatters";

initClientSentry();
// Defer analytics init to after first paint — not needed for rendering
if (typeof requestIdleCallback === "function") {
  requestIdleCallback(() => initAnalytics());
} else {
  setTimeout(initAnalytics, 0);
}

// Lazy-load Login (pulls Three.js ~600KB via SpinningLogo3D) and ResearchRefreshOverlay (also Three.js)
const Login = lazy(() => import("@/pages/Login"));
const ResearchRefreshOverlay = lazy(() =>
  import("@/components/ResearchRefreshOverlay").then(m => ({ default: m.ResearchRefreshOverlay }))
);
const ScheduledResearchOverlayLazy = lazy(() =>
  import("@/components/research/ScheduledResearchOverlay").then(m => ({ default: m.ScheduledResearchOverlay }))
);
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Company = lazy(() => import("@/pages/Company"));
const CompanyAssumptions = lazy(() => import("@/pages/CompanyAssumptions"));
const Portfolio = lazy(() => import("@/pages/Portfolio"));
const Profile = lazy(() => import("@/pages/Profile"));
const PropertyDetail = lazy(() => import("@/pages/PropertyDetail"));
const PropertyEdit = lazy(() => import("@/pages/PropertyEdit"));
const PropertyPhotos = lazy(() => import("@/pages/PropertyPhotos"));
const PropertyMarketResearch = lazy(
  () => import("@/pages/PropertyMarketResearch"),
);
const PropertyResearchCriteria = lazy(
  () => import("@/pages/PropertyResearchCriteria"),
);
const CompanyResearch = lazy(() => import("@/pages/CompanyResearch"));
const CompanyIcpDefinition = lazy(() => import("@/pages/CompanyIcpDefinition"));
const GlobalResearch = lazy(() => import("@/pages/GlobalResearch"));
const ResearchHub = lazy(() => import("@/pages/ResearchHub"));
const Admin = lazy(() => import("@/pages/Admin"));
const Logos = lazy(() => import("@/pages/Logos"));
const Scenarios = lazy(() => import("@/pages/Scenarios"));
const PropertyFinder = lazy(() => import("@/pages/PropertyFinder"));
const SensitivityAnalysis = lazy(() => import("@/pages/SensitivityAnalysis"));
const FinancingAnalysis = lazy(() => import("@/pages/FinancingAnalysis"));
const Analysis = lazy(() => import("@/pages/Analysis"));
const CheckerManual = lazy(() => import("@/pages/CheckerManual"));
const Help = lazy(() => import("@/pages/Help"));
const MapView = lazy(() => import("@/pages/MapView"));
const IcpStudio = lazy(() => import("@/pages/IcpStudio"));
const Icp = lazy(() => import("@/pages/Icp"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const About = lazy(() => import("@/pages/About"));
const GoogleDrive = lazy(() => import("@/pages/GoogleDrive"));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

function ProtectedRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

function AdminRoute({
  component: Component,
  redirectTo = "/",
}: {
  component: React.ComponentType;
  redirectTo?: string;
}) {
  const { user, isLoading, isAdmin } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/login" />;
  if (!isAdmin) return <Redirect to={redirectTo} />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

function ManagementRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { user, isLoading, hasManagementAccess } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/login" />;
  if (!hasManagementAccess) return <Redirect to="/" />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

function CheckerRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { user, isLoading, isAdmin } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/login" />;

  const isChecker = isAdmin || user.role === UserRole.CHECKER;
  if (!isChecker) return <Redirect to="/" />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

function IcpRedirect() {
  const { user, isLoading, hasManagementAccess } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/login" />;
  if (!hasManagementAccess) return <Redirect to="/" />;
  setAdminSectionFn("icp");
  return <Redirect to="/admin" />;
}


const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

function GlobalBeforeUnloadGuard() {
  const { isDirty } = useScenarioDirtyState();
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
  return null;
}

function NavigationGuard() {
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

function IdleAutoSave() {
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

function AutoSaveRestorePrompt() {
  const { user } = useAuth();
  const { data: autoSaveCheck, isLoading: checkLoading } = useAutoSaveCheck(!!user);
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

function LogoutProtectionDialog() {
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

function ScheduledResearchGate() {
  const { user } = useAuth();
  const [staleWorkflows, setStaleWorkflows] = useState<any[]>([]);
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

/** Router — declares all client-side routes and handles the research refresh overlay. */
function Router() {
  const { user, isLoading } = useAuth();
  const [showResearchRefresh, setShowResearchRefresh] = useState(false);
  const prevUserRef = useRef<any>(null);

  useEffect(() => {
    if (user) {
      setClientUser({ id: user.id, email: user.email, role: user.role });
      identifyUser({ id: user.id, email: user.email, role: user.role, companyId: user.companyId });
      if (!prevUserRef.current) trackUserLogin(user.role);
    }
  }, [user]);

  useEffect(() => {
    if (user && !prevUserRef.current) {
      const guardKey = `research_refresh_done_${user.id || "default"}`;
      const sessionGuard = sessionStorage.getItem(guardKey);
      if (sessionGuard) {
        prevUserRef.current = user;
        return;
      }

      const countBusinessDays = (from: Date, to: Date): number => {
        let count = 0;
        const current = new Date(from);
        while (current < to) {
          const day = current.getDay();
          if (day !== 0 && day !== 6) count++;
          current.setDate(current.getDate() + 1);
        }
        return count;
      };

      Promise.all([
        fetch("/api/research/last-full-refresh", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/global-assumptions", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
      ])
        .then(([refreshData, gaData]) => {
          if (!gaData || gaData.autoResearchRefreshEnabled !== true) return;

          if (!refreshData || !refreshData.lastRefresh) {
            setShowResearchRefresh(true);
          } else {
            const businessDays = countBusinessDays(new Date(refreshData.lastRefresh), new Date());
            if (businessDays >= 30) {
              setShowResearchRefresh(true);
            }
          }
        })
        .catch(() => { /* ignore: best-effort prefetch */ });
    }
    prevUserRef.current = user;
  }, [user]);

  const handleResearchComplete = useCallback((skipped?: boolean) => {
    setShowResearchRefresh(false);
    const guardKey = `research_refresh_done_${user?.id || "default"}`;
    sessionStorage.setItem(guardKey, Date.now().toString());
    if (!skipped) {
      fetch("/api/research/mark-full-refresh", {
        method: "POST",
        credentials: "include",
      }).catch(() => { /* ignore: best-effort fire-and-forget */ });
    }
    queryClient.invalidateQueries({ queryKey: ["research"] });
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <GlobalBeforeUnloadGuard />
      <NavigationGuard />
      <IdleAutoSave />
      <AutoSaveRestorePrompt />
      <LogoutProtectionDialog />
      {showResearchRefresh && (
        <Suspense fallback={<PageLoader />}>
          <ResearchRefreshOverlay onComplete={handleResearchComplete} />
        </Suspense>
      )}
      <ScheduledResearchGate />
      <Switch>
        <Route path="/login">{user ? <Redirect to="/" /> : <Suspense fallback={<PageLoader />}><Login /></Suspense>}</Route>
        <Route path="/privacy"><Suspense fallback={<PageLoader />}><PrivacyPolicy /></Suspense></Route>
        <Route path="/terms"><Suspense fallback={<PageLoader />}><TermsOfService /></Suspense></Route>
        <Route path="/about"><Suspense fallback={<PageLoader />}><About /></Suspense></Route>
        <Route path="/">
          <FinancialErrorBoundary>
            <ProtectedRoute component={Dashboard} />
          </FinancialErrorBoundary>
        </Route>
        <Route path="/company">
          <FinancialErrorBoundary>
            <ManagementRoute component={Company} />
          </FinancialErrorBoundary>
        </Route>
        <Route path="/company/assumptions">
          <FinancialErrorBoundary>
            <AdminRoute component={CompanyAssumptions} redirectTo="/company" />
          </FinancialErrorBoundary>
        </Route>
        <Route path="/portfolio">
          <FinancialErrorBoundary>
            <ProtectedRoute component={Portfolio} />
          </FinancialErrorBoundary>
        </Route>
        <Route path="/property/:id/edit">
          <FinancialErrorBoundary>
            <ProtectedRoute component={PropertyEdit} />
          </FinancialErrorBoundary>
        </Route>
        <Route path="/property/:id/photos">
          <ProtectedRoute component={PropertyPhotos} />
        </Route>
        <Route path="/property/:id/research">
          <ProtectedRoute component={PropertyMarketResearch} />
        </Route>
        <Route path="/property/:id/criteria">
          <ProtectedRoute component={PropertyResearchCriteria} />
        </Route>
        <Route path="/property/:id">
          <FinancialErrorBoundary>
            <ProtectedRoute component={PropertyDetail} />
          </FinancialErrorBoundary>
        </Route>
        <Route path="/settings">
          <Redirect to="/admin" />
        </Route>
        <Route path="/help">
          <ProtectedRoute component={Help} />
        </Route>
        <Route path="/methodology">
          <Redirect to="/help" />
        </Route>
        <Route path="/research">
          <Redirect to="/" />
        </Route>
        <Route path="/company/icp-definition">
          <ManagementRoute component={CompanyIcpDefinition} />
        </Route>
        <Route path="/company/criteria">
          <Redirect to="/company/icp-definition" />
        </Route>
        <Route path="/company/research">
          <ManagementRoute component={CompanyResearch} />
        </Route>
        <Route path="/global/research">
          <Redirect to="/company/research" />
        </Route>
        <Route path="/admin">
          <AdminRoute component={Admin} />
        </Route>
        <Route path="/admin/logos">
          <AdminRoute component={Logos} />
        </Route>
        <Route path="/admin/icp-studio">
          <AdminRoute component={IcpStudio} />
        </Route>
        <Route path="/icp">
          <IcpRedirect />
        </Route>
        <Route path="/profile">
          <ProtectedRoute component={Profile} />
        </Route>
        <Route path="/scenarios">
          <FinancialErrorBoundary>
            <ManagementRoute component={Scenarios} />
          </FinancialErrorBoundary>
        </Route>
        <Route path="/property-finder">
          <ManagementRoute component={PropertyFinder} />
        </Route>
        <Route path="/analysis">
          <FinancialErrorBoundary>
            <ProtectedRoute component={Analysis} />
          </FinancialErrorBoundary>
        </Route>
        <Route path="/sensitivity">
          <Redirect to="/analysis" />
        </Route>
        <Route path="/financing">
          <Redirect to="/analysis" />
        </Route>
        <Route path="/executive-summary">
          <Redirect to="/" />
        </Route>
        <Route path="/map">
          <FinancialErrorBoundary>
            <ManagementRoute component={MapView} />
          </FinancialErrorBoundary>
        </Route>
        <Route path="/drive">
          <ProtectedRoute component={GoogleDrive} />
        </Route>
        <Route path="/checker-manual">
          <Redirect to="/help" />
        </Route>
        <Route path="/compare">
          <Redirect to="/analysis" />
        </Route>
        <Route path="/timeline">
          <Redirect to="/analysis" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <Sentry.ErrorBoundary
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md mx-auto p-8 text-center rounded-xl border border-border bg-card shadow-lg">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-destructive text-xl">!</span>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-6 text-sm">
              An unexpected error occurred. Our team has been notified.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      }
    >
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </Sentry.ErrorBoundary>
  );
}

export default App;
