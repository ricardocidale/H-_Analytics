/**
 * SearchForm.tsx — Property Finder search criteria form.
 *
 * Collects the user's acquisition search parameters:
 *   • Market / location (free text — e.g. "Nashville, TN" or "Pacific NW")
 *   • Property type filter (boutique hotel, B&B, resort, etc.)
 *   • Room count range (min / max)
 *   • ADR range (min / max Average Daily Rate)
 *   • Budget range (min / max purchase price)
 *
 * On submit, these criteria are sent to the backend which prompts an LLM
 * to generate structured property recommendations. The search query is
 * also saved (SavedSearchBar) so users can re-run it later.
 *
 * Exports the SearchFormData type used by the parent page.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, X } from "@/components/icons/themed-icons";
import { IconBookmark, IconSave } from "@/components/icons";

export interface SearchFormData {
  location: string;
  priceMin: string;
  priceMax: string;
  bedsMin: string;
  lotSizeMin: string;
  propertyType: string;
}

export function SearchForm({
  formData,
  setFormData,
  isSearching,
  onSubmit,
  showSaveDialog,
  setShowSaveDialog,
  saveSearchName,
  setSaveSearchName,
  onSaveSearch,
  isSaveSearchPending,
}: {
  formData: SearchFormData;
  setFormData: (data: SearchFormData) => void;
  isSearching: boolean;
  onSubmit: (e: React.FormEvent) => void;
  showSaveDialog: boolean;
  setShowSaveDialog: (v: boolean) => void;
  saveSearchName: string;
  setSaveSearchName: (v: string) => void;
  onSaveSearch: () => void;
  isSaveSearchPending: boolean;
}) {
  return (
    <form onSubmit={onSubmit} data-testid="form-search">
      <div className="bg-card rounded-2xl shadow-sm border border-primary/20 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary" />
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <Label className="text-foreground font-medium text-xs mb-1 block">Location (City, State or Zip)</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. Hudson, NY or 12534"
                className="bg-muted border-border text-foreground placeholder-gray-400 focus:border-primary focus:ring-primary/20"
                data-testid="input-location"
              />
            </div>
            <div>
              <Label className="text-foreground font-medium text-xs mb-1 block">Min Price</Label>
              <Input
                type="number"
                value={formData.priceMin}
                onChange={(e) => setFormData({ ...formData, priceMin: e.target.value })}
                placeholder="$500,000"
                className="bg-muted border-border text-foreground placeholder-gray-400 focus:border-primary focus:ring-primary/20"
                data-testid="input-price-min"
              />
            </div>
            <div>
              <Label className="text-foreground font-medium text-xs mb-1 block">Max Price</Label>
              <Input
                type="number"
                value={formData.priceMax}
                onChange={(e) => setFormData({ ...formData, priceMax: e.target.value })}
                placeholder="$5,000,000"
                className="bg-muted border-border text-foreground placeholder-gray-400 focus:border-primary focus:ring-primary/20"
                data-testid="input-price-max"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-foreground font-medium text-xs mb-1 block">Min Bedrooms</Label>
              <Input
                type="number"
                value={formData.bedsMin}
                onChange={(e) => setFormData({ ...formData, bedsMin: e.target.value })}
                placeholder="5+"
                className="bg-muted border-border text-foreground placeholder-gray-400 focus:border-primary focus:ring-primary/20"
                data-testid="input-beds-min"
              />
            </div>
            <div>
              <Label className="text-foreground font-medium text-xs mb-1 block">Min Lot Size (acres)</Label>
              <Input
                type="number"
                step="0.5"
                value={formData.lotSizeMin}
                onChange={(e) => setFormData({ ...formData, lotSizeMin: e.target.value })}
                placeholder="1"
                className="bg-muted border-border text-foreground placeholder-gray-400 focus:border-primary focus:ring-primary/20"
                data-testid="input-lot-size-min"
              />
            </div>
            <div>
              <Label className="text-foreground font-medium text-xs mb-1 block">Property Type</Label>
              <Select
                value={formData.propertyType}
                onValueChange={(v) => setFormData({ ...formData, propertyType: v })}
              >
                <SelectTrigger
                  className="bg-muted border-border text-foreground focus:border-primary focus:ring-primary/20"
                  data-testid="select-property-type"
                >
                  <SelectValue placeholder="Any type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Type</SelectItem>
                  <SelectItem value="single_family">Single Family</SelectItem>
                  <SelectItem value="multi_family">Multi-Family</SelectItem>
                  <SelectItem value="farm">Farm / Ranch</SelectItem>
                  <SelectItem value="land">Land</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {formData.location.trim() && (
                <>
                  {showSaveDialog ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={saveSearchName}
                        onChange={(e) => setSaveSearchName(e.target.value)}
                        placeholder="Search name..."
                        className="bg-muted border-border text-foreground placeholder-gray-400 focus:border-primary focus:ring-primary/20 w-48 h-9 text-sm"
                        data-testid="input-search-name"
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onSaveSearch())}
                      />
                      <Button
                        type="button"
                        size="icon"
                        onClick={onSaveSearch}
                        disabled={isSaveSearchPending}
                        data-testid="btn-confirm-save-search"
                      >
                        {isSaveSearchPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <IconSave className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => { setShowSaveDialog(false); setSaveSearchName(""); }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSaveDialog(true)}
                      className="text-xs text-primary hover:text-primary/80"
                      data-testid="btn-save-search"
                    >
                      <IconBookmark className="w-3.5 h-3.5" /> Save This Search
                    </Button>
                  )}
                </>
              )}
            </div>
            <Button
              type="submit"
              disabled={isSearching}
              data-testid="btn-search"
            >
              {isSearching ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Searching...</>
              ) : (
                <><Search className="w-4 h-4" /> Search Properties</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
