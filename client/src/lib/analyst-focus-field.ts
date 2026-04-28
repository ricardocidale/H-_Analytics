/**
 * Analyst field-focus URL bridge — companion to `analyst-mount-points.ts`.
 *
 * When the Analyst surfaces an "Adjust" CTA on a verdict dimension, the
 * mount-point resolver appends `?focus=<fieldId>` to the destination URL.
 * Pages that host Specialist-tracked form fields call
 * `useFocusFieldFromUrl()` once on mount; the hook reads the param, finds
 * the matching form-field DOM element, and scrolls + focuses it. This
 * closes the loop the field registry's `mountPoint` was designed to
 * enable: one click on an Analyst verdict carries the user to the exact
 * field that needs attention rather than only the section it lives in.
 *
 * Field-element discovery:
 *   The hook looks for the field via the two existing conventions in this
 *   codebase, in priority order:
 *     1. `[data-field="${fieldId}"]` — used by the Company Assumptions
 *        section components (see `RangePillsLayer.tsx` for the precedent).
 *     2. `[data-testid="field-${fieldId}"]` — used by the admin
 *        Model-Defaults `PctField`/`DollarField`/`NumberField` helpers.
 *   Neither side has to change to opt-in: as soon as a Specialist's field
 *   ids match an existing form's data-* attributes, the focus works.
 *
 * Retry policy:
 *   The destination page often renders the form lazily (Suspense boundary,
 *   tab switch, async data fetch). The hook retries discovery a few times
 *   with a short delay so a slow first render still gets focused. After
 *   focus succeeds OR the budget is exhausted, the `?focus` param is
 *   stripped from the URL via `history.replaceState` so a re-render or
 *   back-nav doesn't refire the focus side-effect.
 */
import { useEffect } from "react";
import { useSearch } from "wouter";

/** Query-string key used to ferry the field id through navigations. Kept
 *  as a single exported constant so `analyst-mount-points.ts` and any
 *  future producer of focus-deep-links use the same key. */
export const FOCUS_QUERY_PARAM = "focus";

interface FocusFieldOptions {
  /** Maximum number of discovery attempts before giving up. */
  readonly maxAttempts?: number;
  /** Delay (ms) between retries while the field element isn't yet mounted. */
  readonly retryMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 20;
const DEFAULT_RETRY_MS = 100;

function escapeForSelector(raw: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(raw);
  }
  // Minimal fallback for jsdom-style envs that lack CSS.escape: escape the
  // characters that matter inside a quoted attribute value selector.
  return raw.replace(/(["\\])/g, "\\$1");
}

/**
 * Find the form-field element associated with `fieldId`, prefering the
 * `data-field` convention used by Company Assumptions sections, then
 * falling back to the `data-testid="field-<id>"` convention used by the
 * admin Model-Defaults helpers.
 */
export function findFieldElement(fieldId: string): HTMLElement | null {
  if (!fieldId || typeof document === "undefined") return null;
  const escaped = escapeForSelector(fieldId);
  const dataFieldEl = document.querySelector<HTMLElement>(
    `[data-field="${escaped}"]`,
  );
  if (dataFieldEl) return dataFieldEl;
  return document.querySelector<HTMLElement>(
    `[data-testid="field-${escaped}"]`,
  );
}

/**
 * Scroll `el` into view and focus the most natural form control inside it
 * (or `el` itself if it is already a control). Used by `useFocusFieldFromUrl`
 * but exported for direct use by tests.
 */
export function focusFieldElement(el: HTMLElement): void {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const isControl = el.matches?.("input, textarea, select, button, [tabindex]");
  const focusTarget: HTMLElement | null = isControl
    ? el
    : (el.querySelector<HTMLElement>(
        "input, textarea, select, button, [tabindex]",
      ) ?? null);
  if (focusTarget && typeof focusTarget.focus === "function") {
    try {
      focusTarget.focus({ preventScroll: true });
    } catch {
      // Older browsers that ignore the options bag — fall back to the
      // unconditional .focus() call.
      focusTarget.focus();
    }
  }
}

/**
 * One-shot lookup + focus. Returns `true` when the field was found and
 * focused, `false` otherwise. Exported for tests.
 */
export function focusFieldById(fieldId: string): boolean {
  const el = findFieldElement(fieldId);
  if (!el) return false;
  focusFieldElement(el);
  return true;
}

/**
 * Dev-only warning surfaced when `useFocusFieldFromUrl()` exhausts its
 * retry budget without ever finding a marker for `fieldId` in the DOM.
 *
 * The build-time audit (task #771) catches static drift between the
 * field registry and the destination form's source, but a marker can
 * still be present in source yet hidden at runtime — e.g. inside a
 * collapsed/conditional section like the toggle-gated rows in
 * `ConvertibleTermsCard`. In those cases the user clicks Adjust, lands
 * on the right page, and the focus hook silently exhausts its budget.
 *
 * Logging here surfaces the failure during normal development without
 * polluting production logs (gated by `import.meta.env.DEV`). The
 * message names the missing fieldId and the URL that asked for it so
 * a developer can immediately see (a) which Specialist field id is
 * mis-aligned and (b) which destination page failed to expose it.
 */
function warnFocusFieldExhausted(fieldId: string): void {
  if (!import.meta.env.DEV) return;
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  const url =
    typeof window !== "undefined" && window.location
      ? window.location.href
      : "(no window)";
  console.warn(
    `[analyst-focus-field] Could not focus field "${fieldId}" — ` +
      `no matching [data-field] or [data-testid="field-..."] marker ` +
      `appeared in the DOM after the retry budget was exhausted. ` +
      `URL: ${url}. The field may be inside a collapsed/conditional ` +
      `section, or the Specialist field id may not match any marker ` +
      `on this page.`,
  );
}

function stripFocusParam(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(FOCUS_QUERY_PARAM)) return;
  url.searchParams.delete(FOCUS_QUERY_PARAM);
  const search = url.searchParams.toString();
  const newUrl = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  window.history.replaceState(window.history.state, "", newUrl);
}

/**
 * React hook — pages that host Specialist-tracked form fields call this
 * once at mount. It reads `?focus=<fieldId>` from the URL, retries until
 * the form is mounted, scrolls + focuses the field, then strips the param
 * so the side-effect doesn't re-fire on re-renders or back-nav.
 *
 * Idempotent — if no `?focus` param is present, the hook is a no-op.
 *
 * URL-reactive (task #767): the hook subscribes to wouter's `useSearch()`
 * so it re-fires whenever the URL search string changes, not only on the
 * initial mount. This matters when the user is already on the destination
 * page (e.g. clicking "Open this field" on the Funding tab while sitting
 * on the Funding tab) — wouter's `navigate()` only changes the URL via
 * `history.pushState` and the page does not re-mount, so a mount-only
 * effect would silently no-op. Wouter monkey-patches `pushState` /
 * `replaceState` to dispatch synthetic events, which `useSearch()` reads
 * via `useSyncExternalStore`, so both the producer's `navigate()` AND the
 * cleanup's `stripFocusParam()` round-trip cleanly.
 */
export function useFocusFieldFromUrl(opts: FocusFieldOptions = {}): void {
  // Subscribe to URL search-string changes so same-page deep links (e.g.
  // clicking "Open this field" while already on the destination surface)
  // still trigger the focus side-effect. The value itself is not used —
  // it only exists to schedule a re-run of the effect below.
  const search = useSearch();

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    // Read directly from `window.location.search` rather than the `search`
    // value in scope: the two are equivalent in the browser, and using
    // `window.location` keeps the hook robust if a downstream test stub
    // returns a stale snapshot from `useSearch()`.
    const url = new URL(window.location.href);
    const fieldId = url.searchParams.get(FOCUS_QUERY_PARAM);
    if (!fieldId) return;

    const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const retryMs = opts.retryMs ?? DEFAULT_RETRY_MS;
    let attempts = 0;
    let timer: number | null = null;

    const tryFocus = (): void => {
      attempts += 1;
      const ok = focusFieldById(fieldId);
      if (ok || attempts >= maxAttempts) {
        if (!ok) warnFocusFieldExhausted(fieldId);
        stripFocusParam();
        timer = null;
        return;
      }
      timer = window.setTimeout(tryFocus, retryMs);
    };

    // Defer one tick so Suspense fallbacks / lazy boundaries have a chance
    // to swap in the real form before the first lookup attempt.
    timer = window.setTimeout(tryFocus, 0);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
    // Re-run when the URL search string changes (a new `?focus=` lands or
    // the previous one is stripped). `opts.maxAttempts` / `opts.retryMs`
    // are read off the live `opts` object inside the effect — callers pass
    // a stable literal, so the hook would re-fire spuriously if we listed
    // them in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
}
