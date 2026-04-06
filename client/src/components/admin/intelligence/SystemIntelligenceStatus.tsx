import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MdOutlineMemory, MdOutlineCloud, MdOutlineWarning, MdOutlineCheckCircle, MdOutlineError } from "react-icons/md";

interface LlmVendorStatus {
  vendor: string;
  available: boolean;
  reason?: string;
}

interface SystemStatusData {
  llmVendors: LlmVendorStatus[];
  recommendedDefaults: { vendor: string; model: string };
  knowledgeBase: {
    pinecone: boolean;
    embeddings: boolean;
    learningActive: boolean;
    message: string;
  };
  missingKeys: {
    fredApiKey: boolean;
    pineconeApiKey: boolean;
    embeddingKey: boolean;
  };
}

const vendorLabels: Record<string, string> = {
  google: "Google Gemini",
  anthropic: "Anthropic Claude",
  openai: "OpenAI GPT",
};

export default function SystemIntelligenceStatus() {
  const { data, isLoading, error } = useQuery<SystemStatusData>({
    queryKey: ["admin", "system-intelligence-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system-intelligence-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    staleTime: 60_000,
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
          <MdOutlineError className="w-8 h-8 mx-auto mb-2" />
          Failed to load system intelligence status
        </CardContent>
      </Card>
    );
  }

  const missingKeysList = Object.entries(data.missingKeys)
    .filter(([, missing]) => missing)
    .map(([key]) => {
      switch (key) {
        case "fredApiKey": return "FRED_API_KEY (macro rates: SOFR, Treasury, CPI)";
        case "pineconeApiKey": return "PINECONE_API_KEY (vector knowledge base)";
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
              <MdOutlineCloud className="w-4 h-4 text-primary" />
              LLM Vendors
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.llmVendors.map(v => (
              <div key={v.vendor} className="flex items-center justify-between text-sm" data-testid={`vendor-status-${v.vendor}`}>
                <span className="text-foreground">{vendorLabels[v.vendor] || v.vendor}</span>
                {v.available ? (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800">
                    <MdOutlineCheckCircle className="w-3 h-3 mr-1" /> Ready
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800">
                    <MdOutlineError className="w-3 h-3 mr-1" /> Unavailable
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
              <MdOutlineMemory className="w-4 h-4 text-primary" />
              Knowledge Learning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Pinecone</span>
              {data.knowledgeBase.pinecone ? (
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
            <div className="pt-2 border-t border-border/50">
              {data.knowledgeBase.learningActive ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <MdOutlineCheckCircle className="w-3.5 h-3.5" />
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
                <MdOutlineWarning className="w-4 h-4" />
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
    </div>
  );
}
