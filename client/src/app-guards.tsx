import { Suspense } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "@/components/icons/themed-icons";
import { UserRole } from "@shared/constants";
import { setAdminSection as setAdminSectionFn } from "@/lib/admin-nav";

export const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

export function ProtectedRoute({
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

export function AdminRoute({
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

export function ManagementRoute({
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

export function CheckerRoute({
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

export function IcpRedirect() {
  const { user, isLoading, hasManagementAccess } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/login" />;
  if (!hasManagementAccess) return <Redirect to="/" />;
  setAdminSectionFn("icp");
  return <Redirect to="/admin" />;
}
