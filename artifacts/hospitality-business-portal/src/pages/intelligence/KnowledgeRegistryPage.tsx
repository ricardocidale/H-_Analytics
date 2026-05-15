import { useQuery } from "@tanstack/react-query";
import { AssetPanel, type RegistryEntry } from "@/components/admin/intelligence/knowledge-registry/AssetPanel";
import { adminFetch } from "@/components/admin/hooks";
import { PageLoadingState } from "@/components/ui/page-loading-state";
import { PageErrorState } from "@/components/ui/page-error-state";

export default function KnowledgeRegistryPage() {
  const { data: entries, isLoading, isError } = useQuery<RegistryEntry[]>({
    queryKey: ["/api/admin/knowledge-registry"],
    queryFn: adminFetch<RegistryEntry[]>("/api/admin/knowledge-registry", "Failed to load knowledge registry"),
  });

  if (isLoading) return <PageLoadingState />;

  if (isError) return <PageErrorState message="Couldn't load registry." />;

  return (
    <div className="space-y-2 p-4 max-w-4xl" data-testid="knowledge-registry-page">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Knowledge Registry</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          AI knowledge assets — vector namespaces, benchmark tables, and reference data.
          Expand each panel to browse content and trigger Analyst refresh.
        </p>
      </div>

      <div className="space-y-2">
        {(entries ?? []).map((entry) => (
          <AssetPanel key={entry.id} entry={entry} />
        ))}
      </div>

      {entries?.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No knowledge registry entries found.
        </p>
      )}
    </div>
  );
}
