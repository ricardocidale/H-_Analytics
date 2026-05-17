import { lazy, Suspense, useState } from "react";
import { CurrentThemeTab } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import LogosTab from "./LogosTab";

const AppLogoTab   = lazy(() => import("./brand-assets/AppLogoTab"));
const AnimationsTab = lazy(() => import("./brand-assets/AnimationsTab"));
const BrandAssetsTab = lazy(() => import("./BrandAssetsTab"));

type BrandAssetsSubTab = "app-logo" | "logos" | "animations" | "other-graphics";

const TAB_FALLBACK = (
  <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
);

export default function BrandAssetsPage() {
  const { isSuperAdmin } = useAuth();

  const SUB_TABS = [
    ...(isSuperAdmin ? [{ value: "app-logo" as const, label: "App Logo" }] : []),
    { value: "logos" as const,          label: "Logos" },
    { value: "animations" as const,     label: "Animations" },
    { value: "other-graphics" as const, label: "Other Graphics" },
  ];

  const [activeTab, setActiveTab] = useState<BrandAssetsSubTab>(
    isSuperAdmin ? "app-logo" : "logos",
  );

  return (
    <div data-testid="admin-brand-assets-page">
      <div className="mb-6">
        <CurrentThemeTab
          tabs={SUB_TABS}
          activeTab={activeTab}
          onTabChange={(v) => setActiveTab(v as BrandAssetsSubTab)}
        />
      </div>

      <div>
        {activeTab === "app-logo" && isSuperAdmin && (
          <Suspense fallback={TAB_FALLBACK}>
            <AppLogoTab />
          </Suspense>
        )}
        {activeTab === "logos" && <LogosTab />}
        {activeTab === "animations" && (
          <Suspense fallback={TAB_FALLBACK}>
            <AnimationsTab />
          </Suspense>
        )}
        {activeTab === "other-graphics" && (
          <Suspense fallback={TAB_FALLBACK}>
            <BrandAssetsTab />
          </Suspense>
        )}
      </div>
    </div>
  );
}
