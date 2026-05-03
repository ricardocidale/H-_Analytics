/**
 * Canonical fallback photos extracted from the source PPTX
 * (`attached_assets/belleayre-mountain-slides_1777774635693.pptx`).
 *
 * Used when a property in the DB has no uploaded photos for a given slide
 * slot — keeps the deck visually complete instead of showing dark "L+B"
 * placeholders. When the user uploads real photos for a property, those
 * take precedence (see PhotoBg / Slide1 binding logic).
 *
 * Indexed by `{ slideIndex: { hero, secondary, inset, ... } }` so each slot
 * is addressable independently.
 */
import slide1Hero from "./slide1-hero.png";
import slide1Secondary from "./slide1-secondary.png";
import slide1Inset from "./slide1-inset.png";

import type { SlidePhoto } from "../types";

function asPhoto(url: string, sortOrder: number, isHero = false): SlidePhoto {
  return { url, sortOrder, isHero };
}

export const CANONICAL_SLIDE_PHOTOS: Record<number, Record<string, SlidePhoto>> = {
  1: {
    hero: asPhoto(slide1Hero, 0, true),
    secondary: asPhoto(slide1Secondary, 1),
    inset: asPhoto(slide1Inset, 2),
  },
};
