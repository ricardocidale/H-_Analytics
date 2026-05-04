import { Suspense } from "react";
import { Redirect, useRoute } from "wouter";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "@/components/icons/themed-icons";

export const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 animate-spin text-accent-pop" />
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

export function IcpRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/login" />;
  return <Redirect to="/ai-intelligence" />;
}

/**
 * Preserves the :propertyId param when redirecting legacy admin slide-deck
 * deep-links to the new Investor Materials route.
 *
 * wouter's static <Redirect> cannot interpolate route params, so we use a
 * component that reads params from context and builds the target URL at
 * render time:
 *   /admin/lb-slides/42  →  /slide-decks/42
 *   /admin/lb-slides     →  /slide-decks
 */
export function LbSlidesRedirect() {
  const [, params] = useRoute<{ propertyId?: string }>("/admin/lb-slides/:propertyId");
  const to = params?.propertyId ? `/slide-decks/${params.propertyId}` : "/slide-decks";
  return <Redirect to={to} />;
}
