/**
 * property-finder/index.ts
 *
 * Barrel export for the Property Finder feature.
 * Property Finder lets users search for potential hotel acquisition targets
 * using AI-powered market research. The workflow:
 *
 *   1. SearchForm       – user enters criteria (market, property type, rooms, ADR)
 *   2. SearchResultCard – each AI-generated result is rendered as a card with
 *                         estimated financials the user can save as a "favorite"
 *   3. FavoriteCard     – saved favorites appear in a sidebar; clicking one
 *                         lets the user import it into the portfolio as a real property
 *   4. SavedSearchBar   – recent search queries are persisted so users can
 *                         re-run them quickly
 */
export { SearchResultCard } from "./SearchResultCard";
export { FavoriteCard } from "./FavoriteCard";
export { SearchForm, type SearchFormData } from "./SearchForm";
export { SavedSearchBar } from "./SavedSearchBar";
export { MarketContextPanel } from "./MarketContextPanel";
export { PropertyValueDrawer } from "./PropertyValueDrawer";
export { PropertyDetailDrawer } from "./PropertyDetailDrawer";
