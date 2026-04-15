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
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { lazy, Suspense, useState, useEffect, useCallback, useRef } from "react";
import {
  ErrorBoundary,
  FinancialErrorBoundary,
} from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";
import { initClientSentry, setClientUser, Sentry } from "@/lib/sentry";
import { initAnalytics, identifyUser, trackUserLogin } from "@/lib/analytics";
import {
  PageLoader,
  ProtectedRoute,
  AdminRoute,
  ManagementRoute,
  CheckerRoute as _CheckerRoute,
  IcpRedirect,
} from "./app-guards";
import {
  GlobalBeforeUnloadGuard,
  NavigationGuard,
  IdleAutoSave,
  AutoSaveRestorePrompt,
  LogoutProtectionDialog,
  ScheduledResearchGate,
} from "./app-session";

initClientSentry();
if (typeof requestIdleCallback === "function") {
  requestIdleCallback(() => initAnalytics());
} else {
  setTimeout(initAnalytics, 0);
}

const Login = lazy(() => import("@/pages/Login"));
const ResearchRefreshOverlay = lazy(() =>
  import("@/components/ResearchRefreshOverlay").then(m => ({ default: m.ResearchRefreshOverlay }))
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
const CompanyGuidance = lazy(() => import("@/pages/CompanyGuidance"));
const _ResearchHub = lazy(() => import("@/pages/ResearchHub"));
const Admin = lazy(() => import("@/pages/Admin"));
const Scenarios = lazy(() => import("@/pages/Scenarios"));
const PropertyFinder = lazy(() => import("@/pages/PropertyFinder"));
const Analysis = lazy(() => import("@/pages/Analysis"));
const Help = lazy(() => import("@/pages/Help"));
const MapView = lazy(() => import("@/pages/MapView"));
// const IcpStudio = lazy(() => import("@/pages/IcpStudio"));
const _Icp = lazy(() => import("@/pages/Icp"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const CookiePolicy = lazy(() => import("@/pages/CookiePolicy"));
const About = lazy(() => import("@/pages/About"));

function Router() {
  const { user, isLoading } = useAuth();
  const [showResearchRefresh, setShowResearchRefresh] = useState(false);
  const prevUserRef = useRef<unknown>(null);

  useEffect(() => {
    if (user) {
      setClientUser({ id: user.id, email: user.email, role: user.role });
      identifyUser({ id: user.id, email: user.email, role: user.role });
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
    return <PageLoader />;
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
        <Route path="/cookies"><Suspense fallback={<PageLoader />}><CookiePolicy /></Suspense></Route>
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
        <Route path="/company/guidance">
          <ProtectedRoute component={CompanyGuidance} />
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
          <FinancialErrorBoundary>
            <ProtectedRoute component={PropertyMarketResearch} />
          </FinancialErrorBoundary>
        </Route>
        <Route path="/property/:id/criteria">
          <FinancialErrorBoundary>
            <ProtectedRoute component={PropertyResearchCriteria} />
          </FinancialErrorBoundary>
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
          <FinancialErrorBoundary>
            <ManagementRoute component={CompanyResearch} />
          </FinancialErrorBoundary>
        </Route>
        <Route path="/global/research">
          <Redirect to="/company/research" />
        </Route>
        <Route path="/admin">
          <AdminRoute component={Admin} />
        </Route>
        <Route path="/admin/logos">
          <Redirect to="/admin" />
        </Route>
        <Route path="/admin/icp-studio">
          <Redirect to="/admin" />
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
