import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cpu, Cloud, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

interface LlmVendorStatus {
  vendor: string;
  available: boolean;
  reason?: string;
}

interface SystemStatusData {
  llmVendors: LlmVendorStatus[];
  recommendedDefaults: { vendor: string; model: string };
  knowledgeBase: {
    vectorStore?: boolean;
    embeddings: boolean;
    learningActive: boolean;
    message: string;
  };
  missingKeys: {
    fredApiKey: boolean;
    vectorStore?: boolean;
    embeddingKey: boolean;
  };
}

interface VectorStoreStatsData {
  available: boolean;
  embeddingsAvailable?: boolean;
  totalVectors: number;
  namespaces: Record<string, number>;
  allNamespaces: string[];
}

const vendorLabels: Record<string, string> = {
  google: "Google Gemini",
  anthropic: "Anthropic Claude",
  openai: "OpenAI GPT",
};

const namespaceLabels: Record<string, string> = {
  "knowledge-base": "Knowledge Base",
  "research-history": "Research History",
  "comparables": "Comparables",
  "assumption-guidance": "Assumption Guidance",
  "documents": "Documents",
  "scenarios": "Scenarios",
  "properties": "Properties",
};

const namespaceDescriptions: Record<string, string> = {
  "knowledge-base": "Methodology docs, guides, photos, logos",
  "research-history": "Past research results for prior-knowledge retrieval",
  "comparables": "ADR, occupancy, cap rate benchmarks",
  "assumption-guidance": "Validated assumption ranges (Low/Mid/High)",
  "documents": "Chunked property documents (PDFs/OMs)",
  "scenarios": "Financial scenario summaries",
  "properties": "Property profiles and metadata",
};

export default function SystemIntelligenceStatus() {
  const queryClient = useQueryClient();
  const [reindexingNs, setReindexingNs] = useState<string | null>(null);
  const [clearingNs, setClearingNs] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<SystemStatusData>({
    queryKey: ["admin", "system-intelligence-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system-intelligence-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: vectorStoreStats, isLoading: statsLoading } = useQuery<VectorStoreStatsData>({
    queryKey: ["admin", "vector-store-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/vector-store/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch vector store stats");
      return res.json();
    },
    staleTime: 30_000,
  });

  const reindexMutation = useMutation({
    mutationFn: async (namespace: string) => {
      setReindexingNs(namespace);
      const res = await fetch(`/api/admin/vector-store/reindex/${namespace}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Reindex failed");
      return res.json();
    },
    onSettled: () => {
      setReindexingNs(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "vector-store-stats"] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async (namespace: string) => {
      setClearingNs(namespace);
      const res = await fetch(`/api/admin/vector-store/clear/${namespace}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Clear failed");
      return res.json();
    },
    onSettled: () => {
      setClearingNs(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "vector-store-stats"] });
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="system-intelligence-loading">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-3"><div className="h-5 bg-muted rounded w-40" /></CardHeader>
            <CardContent><div className="h-16 bg-muted rounded" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-destructive/50" data-testid="system-intelligence-error">
        <CardContent className="p-6 text-center text-destructive">
          <XCircle className="w-8 h-8 mx-auto mb-2" />
          Failed to load system intelligence status
        </CardContent>
      </Card>
    );
  }

  const vectorStoreConnected = data.knowledgeBase.vectorStore ?? false;

  const missingKeysList = Object.entries(data.missingKeys)
    .filter(([, missing]) => missing)
    .map(([key]) => {
      switch (key) {
        case "fredApiKey": return "FRED_API_KEY (macro rates: SOFR, Treasury, CPI)";
        case "vectorStore": return "DATABASE_URL (vector store / pgvector)";
        case "embeddingKey": return "OPENAI_EMBEDDING_KEY (vector embeddings for learning)";
        default: return key;
      }
    });

  return (
    <div className="space-y-4" data-testid="system-intelligence-status">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cloud className="w-4 h-4 text-primary" />
              LLM Vendors
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.llmVendors.map(v => (
              <div key={v.vendor} className="flex items-center justify-between text-sm" data-testid={`vendor-status-${v.vendor}`}>
                <span className="text-foreground">{vendorLabels[v.vendor] || v.vendor}</span>
                {v.available ? (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800">
                    <XCircle className="w-3 h-3 mr-1" /> Unavailable
                  </Badge>
                )}
              </div>
            ))}
            <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
              Recommended: <span className="font-medium text-foreground">{vendorLabels[data.recommendedDefaults.vendor] || data.recommendedDefaults.vendor}</span>
              {" "}({data.recommendedDefaults.model})
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              Knowledge Learning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Vector store</span>
              {vectorStoreConnected ? (
                <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">Connected</Badge>
              ) : (
                <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30">Not configured</Badge>
              )}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Embeddings</span>
              {data.knowledgeBase.embeddings ? (
                <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">Available</Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">Unavailable</Badge>
              )}
            </div>
            {vectorStoreStats?.available && (
              <div className="flex items-center justify-between text-sm">
                <span>Total Vectors</span>
                <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30">
                  {vectorStoreStats.totalVectors.toLocaleString()}
                </Badge>
              </div>
            )}
            <div className="pt-2 border-t border-border/50">
              {data.knowledgeBase.learningActive ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Research knowledge is being accumulated
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{data.knowledgeBase.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {missingKeysList.length > 0 && (
          <Card className="border-amber-300/50 dark:border-amber-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                Missing API Keys
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {missingKeysList.map(k => (
                  <li key={k} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    {k}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {vectorStoreStats?.available && (
        <Card data-testid="vector-store-namespace-stats">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" />
                Vector Store Namespaces — pgvector Index
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["admin", "vector-store-stats"] })}
                className="h-7 text-xs"
                data-testid="btn-refresh-vector-store-stats"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Namespace</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Vectors</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(vectorStoreStats.allNamespaces || Object.keys(vectorStoreStats.namespaces)).map(ns => {
                    const count = vectorStoreStats.namespaces[ns] ?? 0;
                    const isReindexing = reindexingNs === ns;
                    const isClearing = clearingNs === ns;
                    return (
                      <tr key={ns} className="border-b border-border/30 last:border-0" data-testid={`vector-store-ns-${ns}`}>
                        <td className="py-2.5">
                          <div className="font-medium text-foreground">{namespaceLabels[ns] || ns}</div>
                          <div className="text-xs text-muted-foreground">{namespaceDescriptions[ns] || ns}</div>
                        </td>
                        <td className="py-2.5 text-right">
                          <Badge
                            variant="outline"
                            className={count > 0
                              ? "text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"
                              : "text-muted-foreground border-border"}
                          >
                            {count.toLocaleString()}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2"
                              disabled={isReindexing || isClearing || !!reindexingNs}
                              onClick={() => reindexMutation.mutate(ns)}
                              data-testid={`btn-reindex-${ns}`}
                            >
                              <RefreshCw className={`w-3 h-3 mr-1 ${isReindexing ? "animate-spin" : ""}`} />
                              {isReindexing ? "Indexing..." : "Re-index"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2 text-destructive hover:text-destructive"
                              disabled={isClearing || isReindexing || count === 0}
                              onClick={() => {
                                if (confirm(`Clear all ${count.toLocaleString()} vectors from "${namespaceLabels[ns] || ns}"?`)) {
                                  clearMutation.mutate(ns);
                                }
                              }}
                              data-testid={`btn-clear-${ns}`}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              {isClearing ? "Clearing..." : "Clear"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {statsLoading && (
              <div className="text-center text-xs text-muted-foreground py-2">Loading namespace stats...</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
