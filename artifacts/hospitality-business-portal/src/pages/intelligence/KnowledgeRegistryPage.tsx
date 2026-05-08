import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "@/components/icons/themed-icons";
import { AssetPanel, type RegistryEntry } from "@/components/admin/intelligence/knowledge-registry/AssetPanel";
import { adminFetch } from "@/components/admin/hooks";

export default function KnowledgeRegistryPage() {
  const { data: entries, isLoading, isError } = useQuery<RegistryEntry[]>({
    queryKey: ["/api/admin/knowledge-registry"],
    queryFn: adminFetch<RegistryEntry[]>("/api/admin/knowledge-registry", "Failed to load knowledge registry"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading knowledge registry…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-12 text-center text-sm text-destructive">
        Failed to load knowledge registry.
      </div>
    );
  }

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
