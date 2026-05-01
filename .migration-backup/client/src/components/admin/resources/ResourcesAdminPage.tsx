import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  consumeResourcesCatalogKindHint,
  type ResourcesCatalogKind,
} from "@/lib/ai-intelligence-nav";

const ResourcesTab = lazy(() => import("./ResourcesTab"));

interface ResourcesAdminPageProps {
  initialKind?: ResourcesCatalogKind;
}

export default function ResourcesAdminPage({ initialKind = "api" }: ResourcesAdminPageProps) {
  const [active, setActive] = useState<ResourcesCatalogKind>(
    () => consumeResourcesCatalogKindHint() ?? initialKind,
  );
  // admin-cleanup #7 — if a fresh kind hint arrives after mount (e.g. a
  // different legacy resources-* deep link is followed while the catalog
  // page is already mounted), pick it up. Without this the hint would be
  // dropped because `useState`'s initializer only runs once per mount.
  useEffect(() => {
    const hint = consumeResourcesCatalogKindHint();
    if (hint) setActive(hint);
  });

  return (
    <Tabs value={active} onValueChange={(v) => setActive(v as ResourcesCatalogKind)} className="space-y-4" data-testid="resources-admin-tabs">
      <TabsList>
        <TabsTrigger value="api"       data-testid="tab-resources-apis">APIs</TabsTrigger>
        <TabsTrigger value="source"    data-testid="tab-resources-sources">Sources</TabsTrigger>
        <TabsTrigger value="benchmark" data-testid="tab-resources-benchmarks">Benchmark Slugs</TabsTrigger>
        <TabsTrigger value="model"     data-testid="tab-resources-models">Models</TabsTrigger>
      </TabsList>
      <Suspense fallback={null}>
        <TabsContent value="api"><ResourcesTab kind="api" /></TabsContent>
        <TabsContent value="source"><ResourcesTab kind="source" /></TabsContent>
        <TabsContent value="benchmark"><ResourcesTab kind="benchmark" /></TabsContent>
        <TabsContent value="model"><ResourcesTab kind="model" /></TabsContent>
      </Suspense>
    </Tabs>
  );
}
