/**
 * Canonical photos extracted from the source PPTX
 * (`attached_assets/canonical/pptx/belleayre-mountain-slides_1777774635693.pptx`).
 *
 * POLICY (per user 2026-05-03): These canonical photos are the SOURCE for
 * every slide+slot. The deck always renders them. DB property_photos do NOT
 * substitute here — there is no per-slot tag in the photos schema, so a
 * "real" photo in the DB cannot reliably be assigned to "the hero slot of
 * slide 3". Until per-slot tagging is added, canonical wins.
 *
 * When per-slot overrides are added later, the resolver in slides.tsx should
 * fall back through the override BEFORE this canonical default — but never
 * past it. A missing canonical entry is a bug, not a fallback opportunity.
 *
 * Indexed by `{ slideIndex: { slot: SlidePhoto } }` so each slot is
 * addressable independently. Slots 2–6 must be populated before the
 * matching slide component is built.
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

/**
 * Defensive accessor — throws loudly if a slide+slot has not been registered.
 * Use this from every Slide component instead of indexing the map directly,
 * so a missing canonical entry surfaces as a build/render error rather than a
 * silent dark "L+B" placeholder panel.
 */
export function getCanonicalPhoto(slideIndex: number, slot: string): SlidePhoto {
  const slide = CANONICAL_SLIDE_PHOTOS[slideIndex];
  if (!slide) {
    throw new Error(
      `[canonical-photos] No canonical photos registered for slide ${slideIndex}. ` +
        `Add an entry to CANONICAL_SLIDE_PHOTOS in canonical-photos/index.ts before rendering this slide.`,
    );
  }
  const photo = slide[slot];
  if (!photo) {
    throw new Error(
      `[canonical-photos] Slide ${slideIndex} has no canonical photo for slot "${slot}". ` +
        `Available slots: ${Object.keys(slide).join(", ") || "(none)"}.`,
    );
  }
  return photo;
}
