/**
 * SavedSearchBar.tsx — Horizontal scrollable list of recent saved searches.
 *
 * Each pill represents a previously-run Property Finder query. Clicking a
 * pill re-populates the SearchForm and re-runs the search. An "X" button
 * deletes the saved search from the database.
 *
 * Saved searches are stored server-side and scoped to the current user,
 * so they persist across sessions. The bar renders a loading spinner
 * while saved searches are being fetched on mount.
 */
import type { SavedSearchData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "@/components/icons/themed-icons";
import { IconBookmark } from "@/components/icons";

export function SavedSearchBar({
  savedSearches,
  onLoadSearch,
  onDeleteSearch,
  isDeletePending,
}: {
  savedSearches: SavedSearchData[];
  onLoadSearch: (search: SavedSearchData) => void;
  onDeleteSearch: (id: number) => void;
  isDeletePending: boolean;
}) {
  if (savedSearches.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="table-saved-searches">
      <span className="text-xs text-muted-foreground mr-1">
        <IconBookmark className="w-3.5 h-3.5 inline mr-1" />
        Saved:
      </span>
      {savedSearches.map((search) => (
        <div
          key={search.id}
          className="inline-flex items-center gap-1.5 bg-primary/10 text-secondary border border-primary/20 rounded-full px-3 py-1.5 text-xs font-medium"
          data-testid={`row-saved-search-${search.id}`}
        >
          <Button
            variant="link"
            size="sm"
            onClick={() => onLoadSearch(search)}
            className="p-0 h-auto text-xs font-medium"
            data-testid={`btn-run-search-${search.id}`}
          >
            {search.name}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDeleteSearch(search.id)}
            disabled={isDeletePending}
            className="p-0.5 h-auto w-auto rounded-full"
            title="Delete search"
            data-testid={`btn-delete-search-${search.id}`}
          >
            {isDeletePending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <X className="w-3 h-3" />
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
