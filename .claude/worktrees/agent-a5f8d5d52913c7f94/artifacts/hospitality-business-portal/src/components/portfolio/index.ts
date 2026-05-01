/**
 * portfolio/index.ts
 *
 * Barrel export for portfolio-level UI components.
 * The portfolio page is the main dashboard showing all properties under
 * management. These components handle adding new properties and displaying
 * each property's summary card:
 *
 *   • CurrencyInput        – a formatted numeric input that displays dollar
 *                            amounts with commas while editing raw numbers
 *   • AddPropertyDialog    – a multi-field dialog for creating a new property
 *                            with name, location, room count, ADR, purchase price,
 *                            and optional AI image generation
 *   • PortfolioPropertyCard – a summary card for one property showing its hero
 *                            image, key metrics, and navigation link to details
 */
export { CurrencyInput } from "./CurrencyInput";
export { AddPropertyDialog } from "./AddPropertyDialog";
export type { AddPropertyFormData } from "./AddPropertyDialog";
export { PortfolioPropertyCard } from "./PortfolioPropertyCard";
