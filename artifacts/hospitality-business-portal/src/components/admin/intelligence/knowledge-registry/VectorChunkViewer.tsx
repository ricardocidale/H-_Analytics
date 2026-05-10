import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { adminFetch } from "@/components/admin/hooks";

interface Chunk {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
}

interface ChunksResponse {
  chunks: Chunk[];
  page: number;
  total: number;
}

const PAGE_SIZE = 20;

interface Props {
  entryId: string;
}

export function VectorChunkViewer({ entryId }: Props) {
  const [page, setPage] = useState(1);

  const url = `/api/admin/knowledge-registry/${entryId}/chunks?page=${page}`;
  const { data, isLoading, isError } = useQuery<ChunksResponse>({
    queryKey: [url],
    queryFn: adminFetch<ChunksResponse>(url, "Failed to load chunks"),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />
        Loading chunks…
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-4 text-sm text-destructive">Failed to load chunks.</p>
    );
  }

  if (!data || data.chunks.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">No chunks indexed yet.</p>
    );
  }

  return (
    <div className="space-y-2" data-testid="vector-chunk-viewer">
      <div className="text-xs text-muted-foreground mb-2">
        {data.total.toLocaleString()} chunk{data.total !== 1 ? "s" : ""} indexed
        {totalPages > 1 && ` · page ${page} of ${totalPages}`}
      </div>

      <div className="space-y-2">
        {data.chunks.map((chunk) => (
          <div
            key={chunk.id}
            className="border rounded-md p-3 bg-muted/30 text-xs"
            data-testid={`chunk-card-${chunk.id}`}
          >
            <div className="font-mono text-[10px] text-muted-foreground mb-1 truncate">
              {chunk.id}
            </div>
            <p className="text-foreground/90 leading-relaxed line-clamp-4 whitespace-pre-wrap">
              {chunk.text}
            </p>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
