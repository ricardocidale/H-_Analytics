import { lazy, Suspense, useState } from "react";
import { CurrentThemeTab } from "@/components/ui/tabs";
import LogosTab from "./LogosTab";

const BrandAssetsTab = lazy(() => import("./BrandAssetsTab"));

type BrandAssetsSubTab = "logos" | "brand-assets";

const SUB_TABS = [
  { value: "logos" as const,        label: "Logos" },
  { value: "brand-assets" as const, label: "Brand Assets" },
];

const TAB_FALLBACK = (
  <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
);

export default function BrandAssetsPage() {
  const [activeTab, setActiveTab] = useState<BrandAssetsSubTab>("logos");

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
        {activeTab === "logos" && <LogosTab />}
        {activeTab === "brand-assets" && (
          <Suspense fallback={TAB_FALLBACK}>
            <BrandAssetsTab />
          </Suspense>
        )}
      </div>
    </div>
  );
}
