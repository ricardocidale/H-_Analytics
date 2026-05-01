export type CandidateFieldSurface =
  | "company-assumptions"
  | "property-edit"
  | "market-macro"
  | "constants";

export interface MissingFieldNavTarget {
  /** Wouter-compatible path (no origin). */
  path: string;
  /** Optional `#anchor` portion to append to `path`. */
  anchor?: string;
  /** Human-readable label for the deep-link button. */
  label: string;
}

export interface CandidateFieldLike {
  key: string;
  label: string;
  surface: CandidateFieldSurface | string;
  surfaceAnchor?: string;
}

export interface NavContext {
  /** Currently-viewed property id, when applicable. */
  propertyId?: number | null;
}

/**
 * Resolve a candidate-field nav target. Returns `null` when the surface is
 * unknown, or when the surface requires entity context that the caller did
 * not provide (e.g. a property-edit field with no `propertyId`).
 */
export function resolveCandidateFieldNavTarget(
  field: CandidateFieldLike,
  context: NavContext = {},
): MissingFieldNavTarget | null {
  const anchor = field.surfaceAnchor;
  switch (field.surface) {
    case "company-assumptions": {
      // Tabs are wired via URL hash on /company/assumptions.
      return {
        path: "/company/assumptions",
        anchor,
        label: "Open Company Assumptions",
      };
    }
    case "property-edit": {
      if (context.propertyId == null) return null;
      // Anchor intentionally dropped: PropertyEdit has no DOM ids matching
      // surfaceAnchor values (e.g. "basics", "location") and no hash-reading
      // scroll logic. Linking with #basics would land at the page top with a
      // dead hash. Tracked as follow-up: add data-section ids + scrollIntoView.
      return {
        path: `/property/${context.propertyId}/edit`,
        anchor: undefined,
        label: "Open Property Edit",
      };
    }
    case "market-macro": {
      return {
        path: "/admin",
        anchor: anchor ?? "macro-market",
        label: "Open Steady State — Macro & Market",
      };
    }
    case "constants": {
      return {
        path: "/admin",
        anchor: anchor ?? "constants",
        label: "Open Steady State — Constants",
      };
    }
    default:
      return null;
  }
}

/** Build a full href (path + #anchor) from a nav target. */
export function navTargetHref(target: MissingFieldNavTarget): string {
  return target.anchor ? `${target.path}#${target.anchor}` : target.path;
}
