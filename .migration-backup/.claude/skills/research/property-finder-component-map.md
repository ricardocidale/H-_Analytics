# Property Finder Component Map

## Architecture
PropertyFinder is a property search page with RapidAPI integration. The page was refactored from a single 787-line file into a ~300-line shell + 4 extracted components.

## File Map
| File | Lines | Purpose |
|------|-------|---------|
| `client/src/pages/PropertyFinder.tsx` | ~300 | Shell: state, queries, mutations, handlers, layout |
| `client/src/components/property-finder/SearchResultCard.tsx` | ~130 | Property search result card with save/image toggle |
| `client/src/components/property-finder/FavoriteCard.tsx` | ~160 | Saved favorite card with notes editing |
| `client/src/components/property-finder/SearchForm.tsx` | ~170 | Search form: location, price, beds, lot size, type |
| `client/src/components/property-finder/SavedSearchBar.tsx` | ~55 | Horizontal saved search tag bar |
| `client/src/components/property-finder/index.ts` | ~5 | Barrel export |

## Component Props

### SearchResultCard
- `property: PropertyFinderResult` — search result data
- `isSaved: boolean` — whether property is in favorites
- `isSaving: boolean` — mutation loading state
- `onToggleFavorite: () => void` — save/unsave handler
- `expandedImage: string | null` — currently expanded image ID
- `onToggleImage: (id: string) => void` — image expand toggle

### FavoriteCard
- `property: SavedProspectiveProperty` — saved property data
- `onRemove: (id: number) => void` — remove from favorites
- `onUpdateNotes: (id: number, notes: string) => void` — update notes
- `isRemoving: boolean` — delete mutation loading state
- `editingNotesId: number | null` — currently editing note ID
- `notesText: string` — current note text
- `onStartEditing: (prop: SavedProspectiveProperty) => void` — begin editing
- `onNotesChange: (value: string) => void` — note text change
- `onSaveNotes: (id: number) => void` — save notes
- `onCancelEditing: () => void` — cancel editing

### SearchForm
- `formData: SearchFormData` — form field values
- `setFormData: (data: SearchFormData) => void` — update form
- `isSearching: boolean` — search loading state
- `onSubmit: (e: React.FormEvent) => void` — form submit
- `showSaveDialog / setShowSaveDialog` — save search dialog toggle
- `saveSearchName / setSaveSearchName` — save search name input
- `onSaveSearch: () => void` — save search handler
- `isSaveSearchPending: boolean` — create saved search loading

### SavedSearchBar
- `savedSearches: SavedSearchData[]` — list of saved searches
- `onLoadSearch: (search: SavedSearchData) => void` — load and run search
- `onDeleteSearch: (id: number) => void` — delete saved search
- `isDeletePending: boolean` — delete mutation loading

## RapidAPI Integration
The property search uses `usePropertySearch` from `@/lib/api` which calls the Realty in US API via RapidAPI. Requires `RAPIDAPI_KEY` secret. The shell handles the "no API key" error state inline.

## Data Flow
1. Shell manages all state (formData, searchParams, expandedImage, editingNotesId, notesText)
2. Shell passes callbacks down to components
3. Components are pure presentational (no data fetching)
4. Search results come from `usePropertySearch(searchParams)`
5. Favorites come from `useProspectiveFavorites()`
6. Saved searches come from `useSavedSearches()`
