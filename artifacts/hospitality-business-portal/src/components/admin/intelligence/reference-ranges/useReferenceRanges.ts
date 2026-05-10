/**
 * useReferenceRanges — React Query hook bundle for the ReferenceRangesTab
 * page.
 *
 * Owns the rows query, the facets query, and the four mutations
 * (create / update / archive / restore). Lifted out of the page shell
 * (task-1360) without behavior changes — query keys, URLs, payload
 * shape, toast titles, and error-message handling are byte-identical
 * to the pre-split source.
 *
 * The hook is intentionally focused on data: form/dialog state stays
 * in the page so the caller can route 409 errors into the form-error
 * state and close the dialog on success.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { FacetsResponse, ReferenceRangeRow } from "./types";

type Options = {
  queryParams: string;
  /**
   * Called when create or update succeeds. The page shell uses this to
   * close the dialog after a successful save.
   */
  onMutationSuccess: () => void;
  /**
   * Called when create or update fails. The page shell maps 409 → "a
   * range with that combination already exists" form error and any
   * other message → raw form error.
   */
  onMutationError: (message: string) => void;
  /**
   * Called after a successful archive, so the page shell can clear
   * the `archiveTarget` row that opened the confirmation.
   */
  onArchiveSuccess: () => void;
};

export function useReferenceRanges({
  queryParams,
  onMutationSuccess,
  onMutationError,
  onArchiveSuccess,
}: Options) {
  const { toast } = useToast();

  // Inline `queryFn` so filter values land in the URL search string.
  // The default query fn does `queryKey.join("/")`, which would turn
  // `["/api/admin/reference-ranges", "domain=macro&country=US"]` into
  // `/api/admin/reference-ranges/domain=macro&country=US` and either 404
  // or get swallowed by the `:id` route. Constructing the URL here keeps
  // the query string where the server expects it.
  const rowsQuery = useQuery<{ rows: ReferenceRangeRow[] }>({
    queryKey: ["/api/admin/reference-ranges", queryParams],
    queryFn: async () => {
      const url = queryParams
        ? `/api/admin/reference-ranges?${queryParams}`
        : `/api/admin/reference-ranges`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const facetsQuery = useQuery<FacetsResponse>({
    queryKey: ["/api/admin/reference-ranges/facets"],
  });

  const invalidateGrid = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/reference-ranges"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/reference-ranges/facets"] });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/admin/reference-ranges", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reference range created" });
      onMutationSuccess();
      invalidateGrid();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      onMutationError(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (args: { id: number; payload: Record<string, unknown> }) => {
      const res = await apiRequest("PUT", `/api/admin/reference-ranges/${args.id}`, args.payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reference range updated" });
      onMutationSuccess();
      invalidateGrid();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      onMutationError(message);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/reference-ranges/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reference range archived" });
      onArchiveSuccess();
      invalidateGrid();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Archive failed", description: message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/reference-ranges/${id}/restore`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reference range restored" });
      invalidateGrid();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Restore failed", description: message, variant: "destructive" });
    },
  });

  return {
    rowsQuery,
    facetsQuery,
    createMutation,
    updateMutation,
    archiveMutation,
    restoreMutation,
    invalidateGrid,
  };
}
