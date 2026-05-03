/**
 * Shared Playwright/PDF render constants for the LB investor deck.
 * Imported by both the full-deck route (property-deck-pdf.ts) and the
 * per-slide route (property-deck-slide.ts) so the values live in one place.
 */
export const TOTAL_SLIDES = 6;
export const PDF_RENDER_TIMEOUT_MS = 90 * 1000;
export const DECK_READY_POLL_TIMEOUT_MS = 60 * 1000;
export const DECK_VIEWPORT_WIDTH = 1920;
export const DECK_VIEWPORT_HEIGHT = 1080;
export const PDF_CONTENT_TYPE = "application/pdf";
