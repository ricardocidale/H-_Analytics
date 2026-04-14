import { useState } from "react";
import Layout from "@/components/Layout";
import { useGlobalAssumptions } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import {
  usePropertySearch,
  useProspectiveFavorites,
  useSaveFavorite,
  useDeleteFavorite,
  useUpdateFavoriteNotes,
  useSavedSearches,
  useCreateSavedSearch,
  useDeleteSavedSearch,
  useMarketContext,
  type PropertyFinderSearchParams,
  type PropertyFinderResult,
  type SavedProspectiveProperty,
  type SavedSearchData,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ChevronLeft, ChevronRight } from "@/components/icons/themed-icons";
import { IconHeart, IconAlertCircle, IconBuilding2 } from "@/components/icons";
import {
  SearchResultCard,
  FavoriteCard,
  SearchForm,
  SavedSearchBar,
  MarketContextPanel,
  PropertyValueDrawer,
  PropertyDetailDrawer,
  type SearchFormData,
} from "@/components/property-finder";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";

export default function PropertyFinder() {
  const { data: global } = useGlobalAssumptions();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useState<PropertyFinderSearchParams | null>(null);
  const [formData, setFormData] = useState<SearchFormData>({
    location: "",
    priceMin: "",
    priceMax: "",
    bedsMin: "",
    lotSizeMin: "1",
    propertyType: "any",
  });
  const [saveSearchName, setSaveSearchName] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);
  const [notesText, setNotesText] = useState("");
  const [valuePropertyId, setValuePropertyId] = useState<string | null>(null);
  const [detailProperty, setDetailProperty] = useState<PropertyFinderResult | null>(null);

  const { data: searchData, isLoading: isSearching, error: searchError } = usePropertySearch(searchParams);
  const { data: favorites = [], isLoading: isFavoritesLoading } = useProspectiveFavorites();

  const searchState = searchData?.results?.[0]?.state || searchParams?.location?.split(",")[1]?.trim() || undefined;
  const { data: marketContext, isLoading: isMarketContextLoading } = useMarketContext(
    searchParams ? searchParams.location : null,
    searchState
  );
  const { data: savedSearches = [], isLoading: _isSavedSearchesLoading } = useSavedSearches();
  const saveFavorite = useSaveFavorite();
  const deleteFavorite = useDeleteFavorite();
  const updateNotes = useUpdateFavoriteNotes();
  const createSavedSearch = useCreateSavedSearch();
  const deleteSavedSearch = useDeleteSavedSearch();

  const savedExternalIds = new Set(favorites.map((f) => f.externalId));

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.location.trim()) {
      toast({ title: "Location required", description: "Enter a city, state or zip code to search.", variant: "destructive" });
      return;
    }
    setSearchParams({
      location: formData.location.trim(),
      priceMin: formData.priceMin || undefined,
      priceMax: formData.priceMax || undefined,
      bedsMin: formData.bedsMin || undefined,
      lotSizeMin: formData.lotSizeMin || undefined,
      propertyType: formData.propertyType !== "any" ? formData.propertyType : undefined,
    });
  };

  const handlePageChange = (newOffset: number) => {
    if (searchParams) {
      setSearchParams({ ...searchParams, offset: String(newOffset) });
    }
  };

  const handleSave = (property: PropertyFinderResult) => {
    saveFavorite.mutate(property, {
      onSuccess: () => toast({ title: "Saved", description: "Property added to your saved list." }),
      onError: () => toast({ title: "Error", description: "Failed to save property.", variant: "destructive" }),
    });
  };

  const handleRemove = (id: number) => {
    deleteFavorite.mutate(id, {
      onSuccess: () => toast({ title: "Removed", description: "Property removed from saved list." }),
      onError: () => toast({ title: "Error", description: "Failed to remove property.", variant: "destructive" }),
    });
  };

  const handleUpdateNotes = (id: number, notes: string) => {
    updateNotes.mutate({ id, notes }, {
      onSuccess: () => toast({ title: "Notes saved" }),
      onError: () => toast({ title: "Error", description: "Failed to save notes.", variant: "destructive" }),
    });
  };

  const handleSaveSearch = () => {
    if (!saveSearchName.trim()) {
      toast({ title: "Name required", description: "Give your search a name to save it.", variant: "destructive" });
      return;
    }
    if (!formData.location.trim()) {
      toast({ title: "Location required", description: "Enter a location before saving the search.", variant: "destructive" });
      return;
    }
    createSavedSearch.mutate({
      name: saveSearchName.trim(),
      filters: {
        location: formData.location.trim(),
        priceMin: formData.priceMin || undefined,
        priceMax: formData.priceMax || undefined,
        bedsMin: formData.bedsMin || undefined,
        lotSizeMin: formData.lotSizeMin || undefined,
        propertyType: formData.propertyType !== "any" ? formData.propertyType : undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Search saved", description: `"${saveSearchName}" has been saved.` });
        setSaveSearchName("");
        setShowSaveDialog(false);
      },
      onError: () => toast({ title: "Error", description: "Failed to save search.", variant: "destructive" }),
    });
  };

  const handleLoadSearch = (search: SavedSearchData) => {
    const { filters } = search;
    setFormData({
      location: filters.location,
      priceMin: filters.priceMin || "",
      priceMax: filters.priceMax || "",
      bedsMin: filters.bedsMin || "",
      lotSizeMin: filters.lotSizeMin || "1",
      propertyType: filters.propertyType || "any",
    });
    setSearchParams({
      location: filters.location,
      priceMin: filters.priceMin || undefined,
      priceMax: filters.priceMax || undefined,
      bedsMin: filters.bedsMin || undefined,
      lotSizeMin: filters.lotSizeMin || undefined,
      propertyType: filters.propertyType || undefined,
    });
    toast({ title: "Search loaded", description: `Running "${search.name}" search...` });
  };

  const handleDeleteSearch = (id: number) => {
    deleteSavedSearch.mutate(id, {
      onSuccess: () => toast({ title: "Deleted", description: "Saved search removed." }),
      onError: () => toast({ title: "Error", description: "Failed to delete search.", variant: "destructive" }),
    });
  };

  const startEditing = (prop: SavedProspectiveProperty) => {
    setEditingNotesId(prop.id);
    setNotesText(prop.notes || "");
  };

  const saveNotes = (id: number) => {
    handleUpdateNotes(id, notesText);
    setEditingNotesId(null);
  };

  const isNoApiKey = searchError?.message?.includes("RapidAPI key not configured");

  return (
    <AnimatedPage>
    <Layout>
      <div className="p-4 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
        <PageHeader
          title="Property Finder"
          subtitle="Discover estates and grand homes with timeless conversion potential"
          variant="light"
        />

        <SavedSearchBar
          savedSearches={savedSearches}
          onLoadSearch={handleLoadSearch}
          onDeleteSearch={handleDeleteSearch}
          isDeletePending={deleteSavedSearch.isPending}
        />

        <SearchForm
          formData={formData}
          setFormData={setFormData}
          isSearching={isSearching}
          onSubmit={handleSearch}
          showSaveDialog={showSaveDialog}
          setShowSaveDialog={setShowSaveDialog}
          saveSearchName={saveSearchName}
          setSaveSearchName={setSaveSearchName}
          onSaveSearch={handleSaveSearch}
          isSaveSearchPending={createSavedSearch.isPending}
        />

        {isNoApiKey && (
          <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            <div className="h-1 bg-primary" />
            <div className="p-6 flex items-start gap-4">
              <IconAlertCircle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-foreground font-semibold mb-1">API Key Required</h3>
                <p className="text-muted-foreground text-sm mb-3">
                  To search real estate listings, you need a free RapidAPI key. Sign up at{" "}
                  <a href="https://rapidapi.com/apidojo/api/realty-in-us" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">
                    rapidapi.com
                  </a>
                  , subscribe to the "Realty in US" API (free tier: 100 requests/month), then add your key as <code className="bg-muted px-1.5 py-0.5 rounded text-xs text-foreground">RAPIDAPI_KEY</code> in the Secrets tab.
                </p>
              </div>
            </div>
          </div>
        )}

        {searchError && !isNoApiKey && (
          <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            <div className="h-0.5 bg-destructive/40" />
            <div className="p-4 flex items-center gap-3">
              <IconAlertCircle className="w-5 h-5 text-destructive" />
              <p className="text-foreground text-sm">{searchError.message}</p>
            </div>
          </div>
        )}

        {searchParams && (
          <MarketContextPanel
            data={marketContext}
            isLoading={isMarketContextLoading}
            location={searchParams.location}
          />
        )}

        {isSearching && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {searchData && (
          <div className="space-y-4" data-testid="table-search-results">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {searchData.total.toLocaleString()} properties found
              </p>
              {searchData.total > 20 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(Math.max(0, searchData.offset - 20))}
                    disabled={searchData.offset === 0}
                    className="p-1.5 rounded-lg h-auto w-auto"
                    data-testid="btn-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {searchData.offset + 1}-{Math.min(searchData.offset + 20, searchData.total)} of {searchData.total.toLocaleString()}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(searchData.offset + 20)}
                    disabled={searchData.offset + 20 >= searchData.total}
                    className="p-1.5 rounded-lg h-auto w-auto"
                    data-testid="btn-next-page"
                  >
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </div>

            {searchData.results.length === 0 ? (
              <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
                <IconBuilding2 className="w-12 h-12 text-primary/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No properties found matching your criteria.</p>
                <p className="text-muted-foreground text-sm mt-1">Try adjusting your filters or searching a different location.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {searchData.results.map((property) => {
                  const isSaved = savedExternalIds.has(property.externalId);
                  const savedProp = favorites.find((f) => f.externalId === property.externalId);
                  return (
                    <SearchResultCard
                      key={property.externalId}
                      property={property}
                      isSaved={isSaved}
                      isSaving={saveFavorite.isPending || deleteFavorite.isPending}
                      onToggleFavorite={isSaved && savedProp ? () => handleRemove(savedProp.id) : () => handleSave(property)}
                      expandedImage={expandedImage}
                      onToggleImage={(id) => setExpandedImage(expandedImage === id ? null : id)}
                      onShowValue={(id) => setValuePropertyId(id)}
                      onShowDetail={(p) => setDetailProperty(p)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!searchData && !searchError && !isSearching && (
          <div className="bg-card rounded-lg shadow-sm border border-border p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-primary/40" />
            </div>
            <p className="text-muted-foreground font-medium">Search for Properties</p>
            <p className="text-muted-foreground text-sm mt-1">
              Enter a location above to find large homes and estates with {(global?.propertyLabel || "boutique hotel").toLowerCase()} conversion potential.
            </p>
          </div>
        )}

        <div className="mt-10" data-testid="table-saved-properties">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-px flex-1 bg-muted" />
            <div className="flex items-center gap-2">
              <IconHeart className="w-5 h-5 text-destructive" />
              <h2 className="text-lg font-display font-bold text-foreground">Your Favorites</h2>
              <span className="text-sm text-muted-foreground">({favorites.length})</span>
            </div>
            <div className="h-px flex-1 bg-muted" />
          </div>

          {isFavoritesLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : favorites.length === 0 ? (
            <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <IconHeart className="w-7 h-7 text-primary/30" />
              </div>
              <p className="text-muted-foreground font-medium">No Saved Properties</p>
              <p className="text-muted-foreground text-sm mt-1">
                Search for properties and click the heart icon to save them here for later review.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {favorites.map((property) => (
                <FavoriteCard
                  key={property.id}
                  property={property}
                  onRemove={handleRemove}
                  onUpdateNotes={handleUpdateNotes}
                  isRemoving={deleteFavorite.isPending}
                  editingNotesId={editingNotesId}
                  notesText={notesText}
                  onStartEditing={startEditing}
                  onNotesChange={setNotesText}
                  onSaveNotes={saveNotes}
                  onCancelEditing={() => setEditingNotesId(null)}
                  onShowValue={(id) => setValuePropertyId(id)}
                  onShowDetail={(p) => setDetailProperty(p)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {valuePropertyId && (
        <PropertyValueDrawer
          propertyId={valuePropertyId}
          address={
            searchData?.results.find((r) => r.externalId === valuePropertyId)?.address
            ?? favorites.find((f) => f.externalId === valuePropertyId)?.address
            ?? "Property"
          }
          onClose={() => setValuePropertyId(null)}
        />
      )}

      {detailProperty && (
        <PropertyDetailDrawer
          property={detailProperty}
          onClose={() => setDetailProperty(null)}
        />
      )}
    </Layout>
    </AnimatedPage>
  );
}
