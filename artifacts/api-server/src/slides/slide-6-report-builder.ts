/**
 * slide-6-report-builder.ts — Factory v2 U6.
 *
 * Builds the `ReportDefinition` that drives the slide-6 income-statement
 * embedded image. Adapts the existing engine-call sequence from
 * `build-lb-payload.ts#buildSlide6Payload` (the "structured report → PNG →
 * embedded in slide" precedent we are lifting) into a pure, DI-friendly
 * builder + a thin helper that wraps the rendered PNG into a U4
 * `SubstitutionEntry`.
 *
 * Responsibilities split:
 *   - `buildSlide6ReportDefinition(...)` — pure function over the run's
 *     properties + global assumptions. Calls the engine (read-only, black
 *     box per CLAUDE.md §9) to produce summed 10-year projections, then
 *     adapts them into the same generic `ReportDefinition` shape consumed
 *     by `render-report-png.ts` (U5) and the `format-generators/*` exporters.
 *   - `buildSlide6ImageSubstitutionEntry(...)` — orchestration helper:
 *     fetches properties + globals via injected storage facades, runs the
 *     engine, calls the builder, renders to PNG, and wraps the PNG into a
 *     `{ slideNumber: 6, shapeId, op: 'image', payload: { image, mimeType,
 *     fitMode: 'letterbox' } }` substitution-map entry.
 *
 * DI discipline (CLAUDE.md §4 / ADR-007):
 *   - All storage / DB / logger access happens via injected functions or
 *     the route-layer storage facade — no imports from `lib/calc/` or
 *     `lib/engine/` that pull DB. `@engine/aggregation/...` and
 *     `@engine/types` are pure modules and importable directly.
 *   - The financial engine surface (CLAUDE.md §9) is consumed as a black
 *     box: we call `recomputeSinglePropertyAndStamp`, `withModelConstants`,
 *     and `aggregateUnifiedByYear`; we never modify them.
 *
 * Inflation policy (CLAUDE.md "Inflation policy"):
 *   - Country argument routes are kept inside the engine; this builder
 *     simply forwards the property's own country (engine internals use 'US'
 *     for USD-base calculations per the policy). We do not call
 *     `getFactoryNumber` here.
 *
 * Image shape name (R7 / U4 contract):
 *   - The v7 reconstruction-package PPTX is the production target; the
 *     slide-6 picture shape's name there has not yet been enumerated in this
 *     worktree. `SLIDE_6_PICTURE_SHAPE_NAME` is a documented placeholder.
 *     pptx-automizer's name-or-text-substring resolver (see
 *     `pptx-substitution.ts#resolveShapeName`) tolerates either an exact
 *     shape `name` or a unique substring of the shape's text body, so the
 *     placeholder remains structurally valid even before the v7 PPTX is
 *     wired in. Callers that already know the exact shape name should pass
 *     it via the helper's `pictureShapeName` argument.
 *
 * Numeric literals (CLAUDE.md §1):
 *   - All numbers in this file are either named constants imported from
 *     `@shared/constants`, structural indices (`0`, `1`), or reused
 *     constants from `deck-render-constants.ts` / `pptx-substitution.ts`.
 */

import { aggregateUnifiedByYear } from "@engine/aggregation/yearlyAggregator";
import type { GlobalInput, PropertyInput } from "@engine/types";
import { DEFAULT_PROJECTION_YEARS } from "@shared/constants";

import { withModelConstants } from "../finance/apply-model-constants";
import { recomputeSinglePropertyAndStamp } from "../finance/recompute";
import { logger } from "../logger";
import type {
  FormattedValue,
  ReportDefinition,
  ReportSection,
  TableRow,
} from "../report/types";
import { storage } from "../storage";
import { buildGlobalInput } from "./build-payload";
import type { SubstitutionEntry } from "./pptx-substitution-types";
import { renderReportToPng } from "./render-report-png";
import type { YearlyCF, YearlyIS } from "./types";

// ── Slide-6 constants (CLAUDE.md §1 — named) ────────────────────────────────

/**
 * The slide number addressed by U6. Slide 6 carries the portfolio income
 * statement embed; this is fixed by the canonical L+B 6-slide deck.
 */
export const SLIDE_6_SLIDE_NUMBER = 6;

/**
 * Placeholder shape name for the slide-6 picture. The v7 reconstruction-
 * package PPTX is the production target and its slide-6 picture shape name
 * has not been enumerated in this worktree (the v7 PPTX is fetched from R2
 * at runtime). pptx-automizer's resolver in
 * `pptx-substitution.ts#resolveShapeName` accepts either an exact shape
 * name (e.g., `"Picture 1"`) OR a unique substring of the shape's text body
 * (e.g., the canonical caption text) — so this default is structurally
 * compatible with the U4 contract even before the v7 PPTX is enumerated.
 *
 * TODO(U7/U8): replace with the exact shape name once the v7 PPTX is loaded
 * and enumerated via `setCreationIds()`. Callers can override via the
 * helper's `pictureShapeName` argument in the meantime.
 */
export const SLIDE_6_PICTURE_SHAPE_NAME = "Picture 1";

/** Slide-6 fit mode for the embedded report image (R7 — letterbox preserves
 *  the report's aspect ratio inside the canonical slot bbox). */
export const SLIDE_6_IMAGE_FIT_MODE = "letterbox" as const;

/** MIME type for the slide-6 image payload — PNG (U5 renderer output). */
export const SLIDE_6_IMAGE_MIME_TYPE = "image/png";

/** Months-per-year constant (calendar identity). */
const MONTHS_PER_YEAR = 12;

/** Percent display scale (math identity: percent-of-1 → percent display). */
const PERCENT_SCALE = 100;

/** Decimal places for percentage display (e.g. "67.5%"). Structural. */
const PCT_DECIMALS = 1;

/** Placeholder design tokens (the renderer uses a fixed palette; tokens are
 *  required by `ReportDefinition` but unused by the PNG output). Mirrors the
 *  precedent in `build-lb-payload.ts#USALI_REPORT_TOKENS_PLACEHOLDER`. */
const SLIDE_6_TOKENS_PLACEHOLDER = {
  primary: "#1c2b1e",
  secondary: "#1c2b1e",
  accent: "#1c2b1e",
  foreground: "#222222",
  border: "#e8e8e5",
  muted: "#f7f7f4",
  surface: "#ffffff",
  background: "#ffffff",
  white: "#ffffff",
  negativeRed: "#b00020",
  chart: [] as string[],
  line: [] as string[],
};

// ── Inputs ──────────────────────────────────────────────────────────────────

/**
 * Minimal property row needed by the builder. Mirrors the
 * `PropertyRow`-shaped subset `buildSlide6Payload` consumes; kept local so
 * the builder is decoupled from the full DB row shape.
 */
export interface Slide6PropertyRow {
  id: number;
  name?: string | null;
  roomCount?: number | null;
  purchasePrice?: number | null;
  [key: string]: unknown;
}

/**
 * Pure-data inputs for `buildSlide6ReportDefinition`. Callers resolve
 * properties + global assumptions in their own layer (route/service) and
 * pass them in — keeps this module testable without DB stubs.
 */
export interface Slide6ReportInputs {
  properties: Slide6PropertyRow[];
  globalAssumptions: Record<string, unknown>;
  projectionYears: number;
}

// ── Formatting helpers (display-only) ───────────────────────────────────────

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "(" : "";
  const end = n < 0 ? ")" : "";
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}${end}`;
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * PERCENT_SCALE).toFixed(PCT_DECIMALS)}%`;
}

function fv(raw: number, text: string): FormattedValue {
  return { raw, text, negative: Number.isFinite(raw) ? raw < 0 : false };
}

function makeRow(
  label: string,
  vals: number[],
  formatter: (n: number) => string,
  type: TableRow["type"],
  format?: string,
): TableRow {
  return {
    category: label,
    values: vals.map((v) => fv(v, formatter(v))),
    rawValues: vals,
    type,
    indent: 0,
    ...(format ? { format } : {}),
  };
}

// ── Engine summation (lifted from build-lb-payload#buildSlide6Payload) ─────

interface PerPropertyEngineResult {
  yearlyIS: YearlyIS[];
  yearlyCF: YearlyCF[];
}

/**
 * Detect whether any cell across the per-property projections is non-finite
 * (NaN / Infinity / -Infinity). Runs against the per-property arrays
 * BEFORE summation so a single bad cell is not silently coerced to 0 by
 * the `|| 0` fall-throughs in `sumYearlyIS` / `sumYearlyCF`.
 *
 * The renderer's value formatter already substitutes "—" for non-finite
 * numbers, but a builder-level scan lets us replace the whole report with
 * a clear "incomplete data" sentinel so admins immediately see the gap
 * rather than rows of em-dashes (R7 / U6 error-path requirement).
 */
function projectionsContainNonFinite(
  perProperty: PerPropertyEngineResult[],
): boolean {
  for (const r of perProperty) {
    for (const row of r.yearlyIS) {
      if (!Number.isFinite(row.revenueTotal)) return true;
      if (!Number.isFinite(row.totalExpenses)) return true;
      if (!Number.isFinite(row.gop)) return true;
      if (!Number.isFinite(row.noi)) return true;
      if (!Number.isFinite(row.soldRooms)) return true;
      if (!Number.isFinite(row.availableRooms)) return true;
      if (!Number.isFinite(row.cleanAdr)) return true;
    }
    for (const row of r.yearlyCF) {
      if (!Number.isFinite(row.debtService)) return true;
      if (!Number.isFinite(row.netCashFlowToInvestors)) return true;
      if (!Number.isFinite(row.cumulativeCashFlow)) return true;
    }
  }
  return false;
}

/**
 * Pure-array variant of the non-finite scan, used by the
 * `adaptYearlyArraysToReportDefinition` entry point where the caller has
 * already summed the per-property arrays. Equivalent semantics; just a
 * different input shape.
 */
function summedProjectionsContainNonFinite(
  yearlyIS: YearlyIS[],
  yearlyCF: YearlyCF[],
): boolean {
  return projectionsContainNonFinite([{ yearlyIS, yearlyCF }]);
}

/**
 * Build the "incomplete data" sentinel `ReportDefinition`. Surfaced to the
 * PNG renderer when the engine produces non-finite cells; downstream
 * (admin UI, Maya, wish-list slide) reads this as a clear signal that the
 * run had a data gap rather than a layout/format failure.
 */
function buildIncompleteDataReport(
  projectionYears: number,
  reason: string,
): ReportDefinition {
  const title = `${projectionYears}-Year Portfolio Pro Forma — Income Statement (USD)`;
  return {
    cover: {
      companyName: "H+ Analytics",
      entityName: "Portfolio",
      reportTitle: title,
      date: "",
    },
    tokens: SLIDE_6_TOKENS_PLACEHOLDER,
    orientation: "landscape",
    sections: [
      {
        kind: "table",
        title: `${title} — incomplete data`,
        years: [],
        rows: [
          {
            category: `Projection data unavailable: ${reason}`,
            values: [],
            rawValues: [],
            type: "header",
            indent: 0,
          },
        ],
      },
    ],
  };
}

/**
 * Sum per-property `yearlyIS` arrays into a single portfolio-level array,
 * mirroring `buildSlide6Payload`'s aggregation. The first `n` entries of
 * each property's array are added cell-wise. Average ADR is computed across
 * properties that report a positive cleanAdr (matches the precedent).
 */
function sumYearlyIS(
  perProperty: PerPropertyEngineResult[],
  maxYears: number,
): YearlyIS[] {
  const summed: YearlyIS[] = [];
  for (let yi = 0; yi < maxYears; yi++) {
    const base: YearlyIS = {
      year: yi + 1,
      revenueTotal: 0,
      totalExpenses: 0,
      noi: 0,
      gop: 0,
      operationalMonthsInYear: MONTHS_PER_YEAR,
      soldRooms: 0,
      availableRooms: 0,
      cleanAdr: 0,
    };
    let adrCount = 0;
    for (const r of perProperty) {
      const row = r.yearlyIS[yi];
      if (!row) continue;
      base.revenueTotal += row.revenueTotal || 0;
      base.totalExpenses += row.totalExpenses || 0;
      base.noi += row.noi || 0;
      base.gop += row.gop || 0;
      base.soldRooms += row.soldRooms || 0;
      base.availableRooms += row.availableRooms || 0;
      // Positive-only rule per the source comment — negative ADR is a
      // bad-data sentinel (loss-leader bookings, refunds) and should not
      // contribute to the portfolio mean. CR finding on PR #120.
      if (row.cleanAdr > 0) {
        base.cleanAdr += row.cleanAdr;
        adrCount += 1;
      }
    }
    if (adrCount > 0) base.cleanAdr = base.cleanAdr / adrCount;
    summed.push(base);
  }
  return summed;
}

/**
 * Sum per-property `yearlyCF` arrays into a single portfolio-level array,
 * computing cumulative cash flow on the summed result. Mirrors
 * `buildSlide6Payload`'s aggregation.
 */
function sumYearlyCF(
  perProperty: PerPropertyEngineResult[],
  maxYears: number,
): YearlyCF[] {
  const summed: YearlyCF[] = [];
  let cumulativeCF = 0;
  for (let yi = 0; yi < maxYears; yi++) {
    const base: YearlyCF = {
      year: yi + 1,
      debtService: 0,
      netCashFlowToInvestors: 0,
      cumulativeCashFlow: 0,
      exitValue: 0,
    };
    for (const r of perProperty) {
      const row = r.yearlyCF[yi];
      if (!row) continue;
      base.debtService += row.debtService || 0;
      base.netCashFlowToInvestors += row.netCashFlowToInvestors || 0;
      if (yi === maxYears - 1) base.exitValue += row.exitValue || 0;
    }
    cumulativeCF += base.netCashFlowToInvestors;
    base.cumulativeCashFlow = cumulativeCF;
    summed.push(base);
  }
  return summed;
}

// ── Engine call (DI-friendly) ───────────────────────────────────────────────

/**
 * Run the engine for each property and collect per-property yearly IS/CF
 * arrays. Stateful side effects (storage stamping in
 * `recomputeSinglePropertyAndStamp`) are accepted as part of the existing
 * black-box engine contract — Factory v2 does not modify the engine
 * (CLAUDE.md §9 / R15).
 *
 * Errors on a single property are logged and the property is skipped, so a
 * single bad property doesn't tank the whole portfolio report. The
 * `projectionsContainNonFinite` check downstream catches the "engine
 * silently produces NaN" case.
 */
async function runEngineForProperties(
  properties: Slide6PropertyRow[],
  globalInput: GlobalInput,
  projectionYears: number,
): Promise<PerPropertyEngineResult[]> {
  const results: PerPropertyEngineResult[] = [];
  for (const property of properties) {
    try {
      const stamped = { ...property, id: property.id } as unknown as PropertyInput;
      const compute = await recomputeSinglePropertyAndStamp({
        property: stamped,
        globalAssumptions: globalInput,
        projectionYears,
      });
      const stampedLoanProps = stamped as unknown as Parameters<
        typeof aggregateUnifiedByYear
      >[1];
      const unified = aggregateUnifiedByYear(
        compute.monthly,
        stampedLoanProps,
        globalInput,
        compute.projectionYears,
      );
      results.push({
        yearlyIS: unified.yearlyIS as unknown as YearlyIS[],
        yearlyCF: unified.yearlyCF as unknown as YearlyCF[],
      });
    } catch (err) {
      logger.warn(
        `[slide-6-report-builder] engine failed for property ${property.id}: ${String(err)}`,
        "slide-factory",
      );
    }
  }
  return results;
}

// ── Public: pure `ReportDefinition` builder ─────────────────────────────────

/**
 * Build the slide-6 `ReportDefinition` directly from already-summed
 * yearly IS/CF arrays. Pure — no engine call, no I/O. Lifted from
 * `build-lb-payload.ts#buildUsaliReportDefinition` so the U5 renderer
 * receives the same row order, labels, and formatting whether the call
 * path is legacy (build-lb-payload) or Factory v2 (this module).
 */
export function adaptYearlyArraysToReportDefinition(
  summedYearlyIS: YearlyIS[],
  summedYearlyCF: YearlyCF[],
  projectionYears: number,
): ReportDefinition {
  if (summedProjectionsContainNonFinite(summedYearlyIS, summedYearlyCF)) {
    return buildIncompleteDataReport(
      projectionYears,
      "one or more cells produced non-finite values during aggregation",
    );
  }

  const yrs = Math.min(summedYearlyIS.length, summedYearlyCF.length);
  if (yrs === 0) {
    return buildIncompleteDataReport(
      projectionYears,
      "engine produced zero yearly rows",
    );
  }
  const years = Array.from({ length: yrs }, (_, i) => `Yr ${i + 1}`);
  const sliceIS = summedYearlyIS.slice(0, yrs);
  const sliceCF = summedYearlyCF.slice(0, yrs);

  const occupancyVals = sliceIS.map((y) =>
    y.availableRooms > 0 ? y.soldRooms / y.availableRooms : 0,
  );

  const rows: TableRow[] = [
    makeRow("Revenue", sliceIS.map((y) => y.revenueTotal), formatUsd, "data"),
    makeRow(
      "Operating Expenses",
      sliceIS.map((y) => y.totalExpenses),
      formatUsd,
      "data",
    ),
    makeRow(
      "Gross Operating Profit",
      sliceIS.map((y) => y.gop),
      formatUsd,
      "subtotal",
    ),
    makeRow("NOI", sliceIS.map((y) => y.noi), formatUsd, "total"),
    makeRow(
      "Debt Service",
      sliceCF.map((y) => y.debtService),
      formatUsd,
      "data",
      "section-break",
    ),
    makeRow(
      "Net Cash Flow",
      sliceCF.map((y) => y.netCashFlowToInvestors),
      formatUsd,
      "data",
    ),
    makeRow(
      "Cumulative Cash Flow",
      sliceCF.map((y) => y.cumulativeCashFlow),
      formatUsd,
      "data",
      "cumul",
    ),
    makeRow("Occupancy", occupancyVals, formatPct, "data"),
    makeRow("ADR", sliceIS.map((y) => y.cleanAdr), formatUsd, "data"),
  ];

  const title = `${projectionYears}-Year Portfolio Pro Forma — Income Statement (USD)`;
  const sections: ReportSection[] = [
    {
      kind: "table",
      title,
      years,
      rows,
    },
  ];

  return {
    cover: {
      companyName: "H+ Analytics",
      entityName: "Portfolio",
      reportTitle: title,
      date: "",
    },
    tokens: SLIDE_6_TOKENS_PLACEHOLDER,
    orientation: "landscape",
    sections,
  };
}

/**
 * Build the slide-6 `ReportDefinition` from the run's inputs by calling the
 * engine for each property and summing results. Returns a sentinel
 * "incomplete data" report when no properties compute successfully or when
 * the summed projections contain non-finite values.
 *
 * This is the route/service-layer entry point. The engine is treated as a
 * pure black box (CLAUDE.md §9): we never modify it, only consume its
 * output. All numeric defaults are sourced from `@shared/constants` or
 * passed in via the inputs.
 */
export async function buildSlide6ReportDefinition(
  inputs: Slide6ReportInputs,
): Promise<ReportDefinition> {
  const { properties, globalAssumptions, projectionYears } = inputs;

  if (properties.length === 0) {
    return buildIncompleteDataReport(
      projectionYears,
      "no properties assigned to the slide-factory run",
    );
  }

  const globalInput = (await withModelConstants(
    buildGlobalInput(globalAssumptions, projectionYears) as unknown as GlobalInput,
  )) as GlobalInput;

  const perProperty = await runEngineForProperties(
    properties,
    globalInput,
    projectionYears,
  );

  if (perProperty.length === 0) {
    return buildIncompleteDataReport(
      projectionYears,
      "engine failed for every property",
    );
  }

  // Scan pre-summation for NaN / Infinity. The downstream summation uses
  // `|| 0` fall-throughs which silently coerce non-finite values; this
  // check ensures a single bad cell still surfaces the sentinel report.
  if (projectionsContainNonFinite(perProperty)) {
    return buildIncompleteDataReport(
      projectionYears,
      "one or more cells produced non-finite values during aggregation",
    );
  }

  // Determine the cell-summable span. `maxYears` takes the longest
  // available projection so a property with a longer series doesn't get
  // silently truncated.
  const longestSeries = Math.max(
    ...perProperty.map((r) => r.yearlyIS.length),
    projectionYears,
  );

  const summedYearlyIS = sumYearlyIS(perProperty, longestSeries);
  const summedYearlyCF = sumYearlyCF(perProperty, longestSeries);

  return adaptYearlyArraysToReportDefinition(
    summedYearlyIS,
    summedYearlyCF,
    projectionYears,
  );
}

// ── Public: substitution-entry helper (U4 contract) ─────────────────────────

/**
 * Inputs for `buildSlide6ImageSubstitutionEntry`. The `propertyIds` field
 * resolves through the injected `loadProperty` function; tests can stub it
 * to avoid hitting the DB. `loadGlobalAssumptions` is similarly injectable.
 *
 * The helper accepts `pictureShapeName` so the U7/U8 callers can override
 * `SLIDE_6_PICTURE_SHAPE_NAME` once the v7 PPTX's shape name is enumerated.
 */
export interface BuildSlide6EntryArgs {
  propertyIds: number[];
  pictureShapeName?: string;
  /** Optional override of the projection-years count. Defaults to whatever
   *  `globalAssumptions.projectionYears` is, falling back to
   *  `DEFAULT_PROJECTION_YEARS`. */
  projectionYearsOverride?: number;
}

/**
 * Coerce + validate a projection-years value. Returns a positive integer
 * suitable for the report builder, falling back to `DEFAULT_PROJECTION_YEARS`
 * when the input is `undefined`, `null`, `NaN`, `Infinity`, non-numeric, or
 * non-positive. CR finding on PR #120 — raw `Number(...)` coercion at the
 * call site could leak invalid values into report metadata.
 */
function validateProjectionYears(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_PROJECTION_YEARS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PROJECTION_YEARS;
  return Math.floor(n);
}

/**
 * Injected dependencies for the entry helper. Keeping these explicit lets
 * the unit tests stub out the engine + renderer without monkey-patching
 * the storage facade.
 */
export interface BuildSlide6EntryDeps {
  loadProperty: (id: number) => Promise<Slide6PropertyRow | null>;
  loadGlobalAssumptions: () => Promise<Record<string, unknown>>;
  buildReport?: (inputs: Slide6ReportInputs) => Promise<ReportDefinition>;
  renderPng?: (report: ReportDefinition) => Promise<Buffer>;
}

/**
 * Default deps wire the production storage facade + the U5 PNG renderer.
 * The factory route/service layer calls this version; tests can pass their
 * own deps to keep the call hermetic.
 */
export const DEFAULT_SLIDE6_ENTRY_DEPS: BuildSlide6EntryDeps = {
  loadProperty: async (id) => {
    const row = (await storage.getProperty(id)) as Slide6PropertyRow | null;
    return row;
  },
  loadGlobalAssumptions: async () => {
    const ga = (await storage.getGlobalAssumptions(undefined)) as
      | Record<string, unknown>
      | null;
    return ga ?? {};
  },
  buildReport: buildSlide6ReportDefinition,
  renderPng: renderReportToPng,
};

/**
 * Build the slide-6 substitution-map entry: fetches the run's properties +
 * global assumptions, runs the engine, renders the report PNG, and wraps
 * the PNG into a U4-compatible `SubstitutionEntry`.
 *
 * The output entry is ready to drop into the substitution map assembled by
 * Marco's dispatch step (U8 — currently TODO). Wrapping is letterbox per
 * R7 so the report's aspect ratio is preserved inside the canonical slide-6
 * picture-shape bbox.
 */
export async function buildSlide6ImageSubstitutionEntry(
  args: BuildSlide6EntryArgs,
  deps: BuildSlide6EntryDeps = DEFAULT_SLIDE6_ENTRY_DEPS,
): Promise<SubstitutionEntry> {
  const { propertyIds } = args;

  // Dedupe before loading. Callers that compose property lists from multiple
  // sources can pass duplicates by accident; without this each duplicate id
  // would load, sum, and inflate the portfolio totals. CR finding on PR #120.
  const uniquePropertyIds = Array.from(new Set(propertyIds));

  const properties: Slide6PropertyRow[] = [];
  for (const id of uniquePropertyIds) {
    try {
      const row = await deps.loadProperty(id);
      if (row) properties.push(row);
    } catch (err) {
      logger.warn(
        `[slide-6-report-builder] loadProperty(${id}) failed: ${String(err)}`,
        "slide-factory",
      );
    }
  }

  const globalAssumptions = await deps.loadGlobalAssumptions();
  // Coerce + validate. Raw `Number(...)` can yield NaN, Infinity, or non-
  // positive values when the source data is malformed; fall back to the
  // default rather than passing nonsense into the report builder. CR
  // finding on PR #120.
  const projectionYears = validateProjectionYears(
    args.projectionYearsOverride ?? globalAssumptions.projectionYears,
  );

  const buildReport = deps.buildReport ?? buildSlide6ReportDefinition;
  const renderPng = deps.renderPng ?? renderReportToPng;

  const report = await buildReport({
    properties,
    globalAssumptions,
    projectionYears,
  });
  const png = await renderPng(report);

  return {
    slideNumber: SLIDE_6_SLIDE_NUMBER,
    shapeId: args.pictureShapeName ?? SLIDE_6_PICTURE_SHAPE_NAME,
    op: "image",
    slotKey: `slide${SLIDE_6_SLIDE_NUMBER}.incomeStatement`,
    payload: {
      image: png,
      mimeType: SLIDE_6_IMAGE_MIME_TYPE,
      fitMode: SLIDE_6_IMAGE_FIT_MODE,
    },
  };
}
