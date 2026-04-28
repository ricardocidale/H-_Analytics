/**
 * Analyst mount-point resolver — turns the opaque routing slugs that live in
 * `engine/analyst/registry/field-registry.ts` (e.g. `property-edit/capital-raise`,
 * `company-assumptions/funding`, `defaults/revenue`) into concrete client-side
 * navigation targets.
 *
 * Why this lives in `client/src/`:
 * The engine-side field registry intentionally records mount points as opaque
 * strings so it stays UI-framework-agnostic (no wouter / react / Vite imports
 * leak into the engine). This file is the single place that knows how those
 * slugs map to actual frontend routes — keep all slug → route knowledge here
 * so adding a new Specialist surface is a one-file change.
 *
 * Resolution rules:
 *   - `property-edit/<section>` → `/property/:id/edit#<section>`. Requires a
 *     `propertyId` in context; returns `null` when one is not available, so
 *     callers without a property in scope (e.g. company-level surfaces) hide
 *     the CTA rather than producing a broken link.
 *   - `company-assumptions/<tab>` → `/company/assumptions?tab=<tab>`. Used for
 *     management-company-level fields (e.g. funding tranches) whose form
 *     inputs live on the Company Assumptions tabs view rather than on a
 *     property surface. Does NOT require a `propertyId` — the surface is
 *     company-scoped (task #760).
 *   - `defaults/<section>` → the Property Defaults admin surface. The `<section>`
 *     is preserved in the URL fragment so future hash-aware code on the admin
 *     page can scroll to the named area.
 *   - Unknown slugs return `null`, matching the registry's "fail-closed"
 *     contract for fields that haven't yet been registered.
 *
 * Field-focus (task #751):
 *   When `ctx.fieldId` is supplied, the resolver appends a `?focus=<fieldId>`
 *   query param to the target URL. The destination page reads it via
 *   `useFocusFieldFromUrl()` (see `analyst-focus-field.ts`) and scrolls /
 *   focuses the matching form field. Closes the loop the field registry's
 *   `mountPoint` was designed to enable: one click on an Analyst verdict
 *   carries the user to the exact field that needs attention rather than
 *   only the section that contains it.
 *
 * The resolver returns both an `href` (for browser-native open-in-new-tab via
 * an anchor) and an `onClick` callback (for SPA-friendly in-page navigation),
 * so consumers can render a real `<a>` while preventing a full page reload.
 */
import { navigate } from "wouter/use-browser-location";
import { setAdminSection } from "@/lib/admin-nav";
import { FOCUS_QUERY_PARAM } from "@/lib/analyst-focus-field";

export interface MountPointTarget {
  /** Canonical URL for the field's edit surface. Safe for `<a href>` and
   *  middle-click open-in-new-tab. */
  readonly href: string;
  /** SPA-friendly navigation handler. Components should call this from an
   *  onClick that also calls `event.preventDefault()` when the user used
   *  a primary click without modifier keys. */
  readonly navigate: () => void;
}

export interface MountPointResolverContext {
  /** The property currently in scope, when the surface is property-scoped.
   *  Required for `property-edit/*` slugs; ignored otherwise. */
  readonly propertyId?: string | number;
  /** When supplied, the target URL carries `?focus=<fieldId>` so the
   *  destination page can scroll/focus the matching form field. Optional —
   *  callers that only want to navigate to the section can omit it. */
  readonly fieldId?: string;
}

function focusQuery(fieldId: string | undefined): string {
  if (!fieldId) return "";
  return `?${FOCUS_QUERY_PARAM}=${encodeURIComponent(fieldId)}`;
}

/**
 * Resolve a field-registry mount-point slug to a navigation target. Returns
 * `null` when the slug is unknown or the required context (e.g. propertyId
 * for `property-edit/*`) is missing — callers should hide the CTA in that
 * case rather than rendering a broken link.
 */
export function resolveFieldMountPoint(
  slug: string,
  ctx: MountPointResolverContext = {},
): MountPointTarget | null {
  if (!slug || typeof slug !== "string") return null;

  if (slug.startsWith("property-edit/")) {
    if (ctx.propertyId == null || ctx.propertyId === "") return null;
    const section = slug.slice("property-edit/".length);
    const href = `/property/${ctx.propertyId}/edit${focusQuery(ctx.fieldId)}${section ? `#${section}` : ""}`;
    return {
      href,
      navigate: () => navigate(href),
    };
  }

  if (slug.startsWith("company-assumptions/")) {
    // The Company Assumptions page mirrors its active tab to `?tab=<key>`
    // (see `getInitialTab` in `client/src/pages/CompanyAssumptions.tsx`),
    // so the slug's trailing segment becomes the tab query param. Field
    // focus rides alongside it as `?focus=<fieldId>` — both params coexist
    // in `window.location.search`, and the page's `useFocusFieldFromUrl()`
    // hook already reads `focus` independently of `tab`.
    const tab = slug.slice("company-assumptions/".length);
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    if (ctx.fieldId) params.set(FOCUS_QUERY_PARAM, ctx.fieldId);
    const qs = params.toString();
    const href = `/company/assumptions${qs ? `?${qs}` : ""}`;
    return {
      href,
      navigate: () => navigate(href),
    };
  }

  if (slug.startsWith("defaults/")) {
    const section = slug.slice("defaults/".length);
    // Some `defaults/<…>` slugs name a real admin sidebar section
    // (Management Company / Property / Market & Macro); the rest are
    // legacy sub-area names (e.g. `defaults/revenue`) that route to the
    // Property Defaults section as their canonical home. Mapping the
    // section names here lets the resolver land the user on the tab that
    // actually hosts the Specialist field — without this, a verdict on a
    // CompanyTab field (e.g. `baseManagementFee`) would land on Property
    // Defaults and the focus hook would silently no-op (task #765).
    const adminSection = ADMIN_DEFAULTS_SECTION_MAP[section];
    if (adminSection) {
      const href = `/admin${focusQuery(ctx.fieldId)}#${adminSection}`;
      return {
        href,
        navigate: () => {
          setAdminSection(adminSection);
          if (ctx.fieldId) navigate(href);
        },
      };
    }
    // Legacy / sub-area slug — preserve the historical contract: navigate
    // to the Property Defaults section, hash carries the sub-area name.
    const href = `/admin${focusQuery(ctx.fieldId)}${section ? `#defaults-property/${section}` : ""}`;
    return {
      href,
      navigate: () => {
        // Update the admin section state first (renders the right tab),
        // then push the URL so the focus query param actually lands on
        // window.location for the destination's focus hook to read.
        // setAdminSection itself navigates to "/admin" when called from
        // off-admin; we follow it with our href to restore the focus
        // query param in either case.
        setAdminSection("defaults-property");
        if (ctx.fieldId) navigate(href);
      },
    };
  }

  return null;
}

/**
 * Maps the slug segment after `defaults/` to a real admin sidebar section
 * (the value the admin shell's `setAdminSection` understands). Slugs not in
 * this map fall back to the legacy `defaults-property` behavior — keeping
 * existing entries like `defaults/revenue` working without change.
 *
 * Add a new entry here when a new admin Defaults sub-section gets a
 * sidebar destination of its own. Keep it in sync with the
 * `defaults-…` arms (and the standalone `constants` arm) of the
 * `AdminSection` union in `client/src/components/admin/AdminSidebar.tsx`.
 *
 * Steady-State sidebar group hosts four destinations: Management Company,
 * Property, Market & Macro, and Constants. The first three live under
 * `defaults-*` admin sections; Constants is a sibling section named
 * `constants` (no `defaults-` prefix) — it's a peer Defaults destination
 * but it owns authority-sourced model constants rather than admin-editable
 * defaults, so it kept its standalone section name. Both name shapes are
 * mapped here so a `defaults/<slug>` mountPoint reaches whichever sidebar
 * section actually hosts the field (task #783).
 */
const ADMIN_DEFAULTS_SECTION_MAP: Record<string, string> = {
  "management-company": "defaults-management-company",
  property: "defaults-property",
  "market-macro": "defaults-market-macro",
  constants: "constants",
};

/**
 * Pretty user-facing labels for the segment after `defaults/` in a
 * mount-point slug. Used by `describeMountPoint` to name the admin
 * Defaults sub-section in human copy (e.g. the "couldn't open this
 * field" toast). Independent of `ADMIN_DEFAULTS_SECTION_MAP` because
 * that map's values are router slugs (`defaults-management-company`),
 * not display labels.
 *
 * Slugs not listed here fall back to a generic title-cased rendering
 * of the slug segment, so a new entry only needs to be added when the
 * default title-case is misleading (e.g. "Market Macro" vs "Market &
 * Macro") or when the slug is shorthand (e.g. "fb" → "F&B").
 */
const DEFAULTS_SECTION_LABELS: Record<string, string> = {
  "management-company": "Management Company",
  property: "Property",
  "market-macro": "Market & Macro",
  revenue: "Revenue",
};

export interface MountPointDescription {
  /** Human-friendly name of the section/tab that owns the field
   *  (e.g. "Funding", "Management Company", "Capital Raise"). */
  readonly section: string;
  /** Human-friendly name of the page/surface the section lives on
   *  (e.g. "Company Assumptions", "Defaults", "Property Edit"). */
  readonly surface: string;
  /** Whether the named region is a tab (top-level switcher on the
   *  surface) or a section (collapsible/scrollable region). Lets the
   *  toast use the right noun: "expand the Funding tab" vs "expand
   *  the Capital Raise section". */
  readonly kind: "tab" | "section";
}

/**
 * Turn a field-registry mount-point slug into the human-readable
 * pieces a UI surface (notably the "couldn't open this field" toast
 * in `analyst-focus-field.ts`) can compose into copy that names the
 * exact section/tab the user needs to expand.
 *
 * Returns `null` when the slug is unknown or doesn't carry a section
 * segment — callers should fall back to generic copy in that case so
 * we never produce a nonsensical sentence.
 */
export function describeMountPoint(
  slug: string,
): MountPointDescription | null {
  if (!slug || typeof slug !== "string") return null;

  if (slug.startsWith("property-edit/")) {
    const sectionSlug = slug.slice("property-edit/".length);
    if (!sectionSlug) return null;
    return {
      section: humanizeSlugSegment(sectionSlug),
      surface: "Property Edit",
      kind: "section",
    };
  }

  if (slug.startsWith("company-assumptions/")) {
    const tabSlug = slug.slice("company-assumptions/".length);
    if (!tabSlug) return null;
    return {
      section: humanizeSlugSegment(tabSlug),
      surface: "Company Assumptions",
      kind: "tab",
    };
  }

  if (slug.startsWith("defaults/")) {
    const sectionSlug = slug.slice("defaults/".length);
    if (!sectionSlug) return null;
    return {
      section:
        DEFAULTS_SECTION_LABELS[sectionSlug] ??
        humanizeSlugSegment(sectionSlug),
      surface: "Defaults",
      kind: "section",
    };
  }

  return null;
}

function humanizeSlugSegment(seg: string): string {
  return seg
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
