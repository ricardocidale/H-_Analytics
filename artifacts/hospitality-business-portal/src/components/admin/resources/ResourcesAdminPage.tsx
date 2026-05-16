import { lazy, Suspense, useEffect, useState } from "react";
import { CurrentThemeTab } from "@/components/ui/tabs";
import {
  consumeResourcesCatalogKindHint,
  type ResourcesCatalogKind,
} from "@/lib/intelligence-nav";

const ResourcesTab = lazy(() => import("./ResourcesTab"));

const RESOURCES_TABS = [
  { value: "api",       label: "APIs" },
  { value: "source",    label: "Sources" },
  { value: "benchmark", label: "Benchmark Slugs" },
  { value: "model",     label: "Models" },
];

interface ResourcesAdminPageProps {
  initialKind?: ResourcesCatalogKind;
}

export default function ResourcesAdminPage({ initialKind = "api" }: ResourcesAdminPageProps) {
  const [active, setActive] = useState<ResourcesCatalogKind>(
    () => consumeResourcesCatalogKindHint() ?? initialKind,
  );
  useEffect(() => {
    const hint = consumeResourcesCatalogKindHint();
    if (hint) setActive(hint);
  });

  return (
    <div className="space-y-4" data-testid="resources-admin-tabs">
      <CurrentThemeTab
        tabs={RESOURCES_TABS}
        activeTab={active}
        onTabChange={(v) => setActive(v as ResourcesCatalogKind)}
      />
      <Suspense fallback={null}>
        {active === "api"       && <ResourcesTab kind="api" />}
        {active === "source"    && <ResourcesTab kind="source" />}
        {active === "benchmark" && <ResourcesTab kind="benchmark" />}
        {active === "model"     && <ResourcesTab kind="model" />}
      </Suspense>
    </div>
  );
}
