/**
 * Factory v2 U6 — slide-6 report builder unit tests.
 *
 * Two layers of coverage:
 *
 *   1. Pure-adapter tests for `adaptYearlyArraysToReportDefinition` — no
 *      engine, no I/O. Verify the row order / labels / formatting / NaN
 *      sentinel behavior on synthetic projections.
 *   2. `buildSlide6ReportDefinition` — mocks the engine + storage layer to
 *      exercise the orchestration logic (engine fan-out, summation,
 *      incomplete-data fallback) without launching the real engine.
 *
 * The substitution-entry helper (`buildSlide6ImageSubstitutionEntry`) is
 * exercised in the integration test
 * (`slide-6-embed-flow.test.ts`) where it composes with the PNG renderer
 * and the U4 substitution engine. The unit tests focus on the builder's
 * own contract.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mock the engine + storage layer before the SUT imports them ─────────────
//
// `slide-6-report-builder.ts` imports `recomputeSinglePropertyAndStamp`
// (which hits storage to stamp `markPropertiesFinancialsComputed`),
// `withModelConstants`, and `aggregateUnifiedByYear`. Stub each at the
// module-boundary so the unit test stays hermetic.

vi.mock("../../finance/recompute", () => ({
  recomputeSinglePropertyAndStamp: vi.fn(),
}));

vi.mock("../../finance/apply-model-constants", () => ({
  withModelConstants: vi.fn(async (g: unknown) => g),
}));

vi.mock("@engine/aggregation/yearlyAggregator", () => ({
  aggregateUnifiedByYear: vi.fn(),
}));

vi.mock("../../slides/build-payload", () => ({
  buildGlobalInput: vi.fn((_ga: unknown, projYears: number) => ({
    projectionYears: projYears,
  })),
}));

vi.mock("../../storage", () => ({
  storage: {
    getProperty: vi.fn(),
    getGlobalAssumptions: vi.fn(),
  },
}));

import { recomputeSinglePropertyAndStamp } from "../../finance/recompute";
import { aggregateUnifiedByYear } from "@engine/aggregation/yearlyAggregator";
import { DEFAULT_PROJECTION_YEARS } from "@shared/constants";

import {
  SLIDE_6_PICTURE_SHAPE_NAME,
  SLIDE_6_SLIDE_NUMBER,
  SLIDE_6_IMAGE_MIME_TYPE,
  Slide6PropertyLoadError,
  adaptYearlyArraysToReportDefinition,
  buildSlide6ReportDefinition,
  buildSlide6ImageSubstitutionEntry,
  type Slide6PropertyRow,
} from "../../slides/slide-6-report-builder";
import type { ReportDefinition } from "../../report/types";
import type { YearlyCF, YearlyIS } from "../../slides/types";

// ── Numeric fixtures (named per CLAUDE.md §1) ──────────────────────────────

const PROJ_YEARS_TEN = 10;
const PROJ_YEARS_FIVE = 5;
const ZERO = 0;
const ONE = 1;
const REVENUE_PER_YEAR = 1_000_000;
const EXPENSES_PER_YEAR = 600_000;
const GOP_PER_YEAR = 400_000;
const NOI_PER_YEAR = 350_000;
const DEBT_SERVICE_PER_YEAR = 100_000;
const NET_CF_PER_YEAR = 250_000;
const SOLD_ROOMS_PER_YEAR = 25_000;
const AVAILABLE_ROOMS_PER_YEAR = 36_500;
const CLEAN_ADR_PER_YEAR = 200;
const EXIT_VALUE_FINAL_YEAR = 5_000_000;

// ── Helpers ────────────────────────────────────────────────────────────────

function makeYearlyIS(years: number): YearlyIS[] {
  return Array.from({ length: years }, (_, i) => ({
    year: i + 1,
    revenueTotal: REVENUE_PER_YEAR,
    totalExpenses: EXPENSES_PER_YEAR,
    gop: GOP_PER_YEAR,
    noi: NOI_PER_YEAR,
    operationalMonthsInYear: 12,
    soldRooms: SOLD_ROOMS_PER_YEAR,
    availableRooms: AVAILABLE_ROOMS_PER_YEAR,
    cleanAdr: CLEAN_ADR_PER_YEAR,
  }));
}

function makeYearlyCF(years: number): YearlyCF[] {
  let cumulative = 0;
  return Array.from({ length: years }, (_, i) => {
    cumulative += NET_CF_PER_YEAR;
    return {
      year: i + 1,
      debtService: DEBT_SERVICE_PER_YEAR,
      netCashFlowToInvestors: NET_CF_PER_YEAR,
      cumulativeCashFlow: cumulative,
      exitValue: i === years - 1 ? EXIT_VALUE_FINAL_YEAR : 0,
    };
  });
}

function makeProperty(id: number): Slide6PropertyRow {
  return {
    id,
    name: `Property ${id}`,
    roomCount: 100,
    purchasePrice: 10_000_000,
  };
}

// ── Pure-adapter tests ──────────────────────────────────────────────────────

describe("adaptYearlyArraysToReportDefinition", () => {
  it("produces a single table section with the canonical row order for 10-year input", () => {
    const is = makeYearlyIS(PROJ_YEARS_TEN);
    const cf = makeYearlyCF(PROJ_YEARS_TEN);

    const report = adaptYearlyArraysToReportDefinition(is, cf, PROJ_YEARS_TEN);

    expect(report.sections).toHaveLength(ONE);
    const section = report.sections[ZERO];
    if (section.kind !== "table") throw new Error("expected table section");
    expect(section.years).toHaveLength(PROJ_YEARS_TEN);
    expect(section.years[ZERO]).toBe("Yr 1");
    expect(section.years[PROJ_YEARS_TEN - 1]).toBe(`Yr ${PROJ_YEARS_TEN}`);

    const labels = section.rows.map((r) => r.category);
    expect(labels).toEqual([
      "Revenue",
      "Operating Expenses",
      "Gross Operating Profit",
      "NOI",
      "Debt Service",
      "Net Cash Flow",
      "Cumulative Cash Flow",
      "Occupancy",
      "ADR",
    ]);
    expect(section.rows[3].type).toBe("total"); // NOI
    expect(section.rows[2].type).toBe("subtotal"); // GOP
    expect(section.rows[4].format).toBe("section-break"); // Debt Service
    expect(section.rows[6].format).toBe("cumul"); // Cumulative CF
  });

  it("renders 5-year input without overflow markers", () => {
    const is = makeYearlyIS(PROJ_YEARS_FIVE);
    const cf = makeYearlyCF(PROJ_YEARS_FIVE);

    const report = adaptYearlyArraysToReportDefinition(is, cf, PROJ_YEARS_FIVE);

    const section = report.sections[ZERO];
    if (section.kind !== "table") throw new Error("expected table section");
    expect(section.years).toHaveLength(PROJ_YEARS_FIVE);
    // Each row should have exactly N values
    for (const row of section.rows) {
      expect(row.values.length).toBe(PROJ_YEARS_FIVE);
    }
  });

  it("returns the incomplete-data sentinel when any cell is non-finite (NaN)", () => {
    const is = makeYearlyIS(PROJ_YEARS_TEN);
    is[2].revenueTotal = NaN; // simulate engine producing a NaN cell
    const cf = makeYearlyCF(PROJ_YEARS_TEN);

    const report = adaptYearlyArraysToReportDefinition(is, cf, PROJ_YEARS_TEN);

    expect(report.sections).toHaveLength(ONE);
    const section = report.sections[ZERO];
    if (section.kind !== "table") throw new Error("expected table section");
    expect(section.title.toLowerCase()).toContain("incomplete data");
    // No year columns — the sentinel has years: []
    expect(section.years).toHaveLength(ZERO);
    expect(section.rows[ZERO].category.toLowerCase()).toContain(
      "projection data unavailable",
    );
  });

  it("returns the incomplete-data sentinel when both arrays are empty", () => {
    const report = adaptYearlyArraysToReportDefinition([], [], PROJ_YEARS_TEN);
    const section = report.sections[ZERO];
    if (section.kind !== "table") throw new Error("expected table section");
    expect(section.title.toLowerCase()).toContain("incomplete data");
  });

  it("computes occupancy as a fraction (soldRooms / availableRooms)", () => {
    const is = makeYearlyIS(PROJ_YEARS_FIVE);
    const cf = makeYearlyCF(PROJ_YEARS_FIVE);

    const report = adaptYearlyArraysToReportDefinition(is, cf, PROJ_YEARS_FIVE);
    const section = report.sections[ZERO];
    if (section.kind !== "table") throw new Error("expected table section");

    const occupancyRow = section.rows.find((r) => r.category === "Occupancy");
    expect(occupancyRow).toBeDefined();
    const expected = SOLD_ROOMS_PER_YEAR / AVAILABLE_ROOMS_PER_YEAR;
    expect(Number(occupancyRow!.rawValues[ZERO])).toBeCloseTo(expected, 4);
    expect(occupancyRow!.values[ZERO].text).toMatch(/%$/);
  });
});

// ── Orchestration: `buildSlide6ReportDefinition` ────────────────────────────

describe("buildSlide6ReportDefinition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function wireEngineHappy(propertyCount: number, years: number) {
    (recomputeSinglePropertyAndStamp as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { monthly: [], projectionYears: years },
    );
    (aggregateUnifiedByYear as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {
        yearlyIS: makeYearlyIS(years),
        yearlyCF: makeYearlyCF(years),
      },
    );
    void propertyCount;
  }

  it("happy path: sums 3 properties' projections into a 10-year report", async () => {
    const PROPERTY_COUNT = 3;
    wireEngineHappy(PROPERTY_COUNT, PROJ_YEARS_TEN);

    const properties = Array.from({ length: PROPERTY_COUNT }, (_, i) =>
      makeProperty(i + 1),
    );
    const report = await buildSlide6ReportDefinition({
      properties,
      globalAssumptions: { projectionYears: PROJ_YEARS_TEN },
      projectionYears: PROJ_YEARS_TEN,
    });

    // Engine called once per property
    expect(recomputeSinglePropertyAndStamp).toHaveBeenCalledTimes(PROPERTY_COUNT);

    const section = report.sections[ZERO];
    if (section.kind !== "table") throw new Error("expected table section");
    expect(section.years).toHaveLength(PROJ_YEARS_TEN);

    // Revenue row should sum to PROPERTY_COUNT * REVENUE_PER_YEAR
    const revenueRow = section.rows.find((r) => r.category === "Revenue");
    expect(revenueRow).toBeDefined();
    expect(Number(revenueRow!.rawValues[ZERO])).toBe(
      PROPERTY_COUNT * REVENUE_PER_YEAR,
    );
  });

  it("returns sentinel when properties list is empty", async () => {
    const report = await buildSlide6ReportDefinition({
      properties: [],
      globalAssumptions: {},
      projectionYears: PROJ_YEARS_TEN,
    });
    const section = report.sections[ZERO];
    if (section.kind !== "table") throw new Error("expected table section");
    expect(section.title.toLowerCase()).toContain("incomplete data");
  });

  it("fails closed (rejects) when engine throws for any property", async () => {
    // CR rev2 on PR #120 (slide-6-report-builder.ts:415): previously this
    // path returned an incomplete-data sentinel. Slide 6 is a financial
    // aggregate; silently rendering a partial sum that *looks* complete is
    // exactly the failure mode CR flagged. The builder now rejects with
    // `Slide6PropertyLoadError` (with the failing id surfaced) so Marco
    // surfaces the failure visibly in the run record.
    (recomputeSinglePropertyAndStamp as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("engine boom"),
    );
    const FAILING_ID = 1;
    const properties = [makeProperty(FAILING_ID), makeProperty(2)];

    let caught: unknown;
    try {
      await buildSlide6ReportDefinition({
        properties,
        globalAssumptions: {},
        projectionYears: PROJ_YEARS_TEN,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Slide6PropertyLoadError);
    expect(caught).toMatchObject({
      name: "Slide6PropertyLoadError",
      propertyId: FAILING_ID,
    });
  });

  it("fails closed when a single property fails mid-portfolio (no silent skip)", async () => {
    // CR rev2 on PR #120: the prior "survives a single property failing while
    // others succeed" semantics produced an aggregate that understated totals
    // by the failing property's share while looking valid to the user. The
    // builder now rejects with the failing id surfaced.
    let call = 0;
    (recomputeSinglePropertyAndStamp as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        call += 1;
        if (call === 1) throw new Error("bad first property");
        return { monthly: [], projectionYears: PROJ_YEARS_TEN };
      },
    );
    (aggregateUnifiedByYear as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {
        yearlyIS: makeYearlyIS(PROJ_YEARS_TEN),
        yearlyCF: makeYearlyCF(PROJ_YEARS_TEN),
      },
    );

    const FAILING_ID = 42;
    const properties = [makeProperty(FAILING_ID), makeProperty(2)];

    await expect(
      buildSlide6ReportDefinition({
        properties,
        globalAssumptions: {},
        projectionYears: PROJ_YEARS_TEN,
      }),
    ).rejects.toMatchObject({
      name: "Slide6PropertyLoadError",
      propertyId: FAILING_ID,
    });
  });

  it("fails closed when the engine returns undefined/null aggregation output", async () => {
    // CR rev2 on PR #120: even when the engine resolves successfully, a
    // null/undefined `unified` object must not silently coerce to a zero
    // contribution — the builder rejects with the failing id surfaced.
    (recomputeSinglePropertyAndStamp as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { monthly: [], projectionYears: PROJ_YEARS_TEN },
    );
    (aggregateUnifiedByYear as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      undefined,
    );

    const FAILING_ID = 7;
    await expect(
      buildSlide6ReportDefinition({
        properties: [makeProperty(FAILING_ID)],
        globalAssumptions: {},
        projectionYears: PROJ_YEARS_TEN,
      }),
    ).rejects.toMatchObject({
      name: "Slide6PropertyLoadError",
      propertyId: FAILING_ID,
    });
  });

  // ── projectionYears validation in the public builder (CR rev2 :540) ───────
  //
  // `buildSlide6ImageSubstitutionEntry` already guarded `projectionYears` via
  // `validateProjectionYears`. CR rev2 flagged that `buildSlide6ReportDefinition`
  // is also publicly exported and unguarded — these tests assert the public
  // builder normalizes `NaN`, `0`, and `Infinity` to the project default.

  it("normalizes projectionYears = NaN to DEFAULT_PROJECTION_YEARS", async () => {
    wireEngineHappy(1, DEFAULT_PROJECTION_YEARS);
    const report = await buildSlide6ReportDefinition({
      properties: [makeProperty(1)],
      globalAssumptions: {},
      projectionYears: Number.NaN,
    });
    const section = report.sections[ZERO];
    if (section.kind !== "table") throw new Error("expected table section");
    expect(section.title).toContain(`${DEFAULT_PROJECTION_YEARS}-Year`);
  });

  it("normalizes projectionYears = 0 to DEFAULT_PROJECTION_YEARS", async () => {
    wireEngineHappy(1, DEFAULT_PROJECTION_YEARS);
    const report = await buildSlide6ReportDefinition({
      properties: [makeProperty(1)],
      globalAssumptions: {},
      projectionYears: 0,
    });
    const section = report.sections[ZERO];
    if (section.kind !== "table") throw new Error("expected table section");
    expect(section.title).toContain(`${DEFAULT_PROJECTION_YEARS}-Year`);
  });

  it("normalizes projectionYears = Infinity to DEFAULT_PROJECTION_YEARS", async () => {
    wireEngineHappy(1, DEFAULT_PROJECTION_YEARS);
    const report = await buildSlide6ReportDefinition({
      properties: [makeProperty(1)],
      globalAssumptions: {},
      projectionYears: Number.POSITIVE_INFINITY,
    });
    const section = report.sections[ZERO];
    if (section.kind !== "table") throw new Error("expected table section");
    expect(section.title).toContain(`${DEFAULT_PROJECTION_YEARS}-Year`);
  });

  it("surfaces incomplete-data sentinel when engine produces NaN cells", async () => {
    (recomputeSinglePropertyAndStamp as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { monthly: [], projectionYears: PROJ_YEARS_TEN },
    );
    const badIS = makeYearlyIS(PROJ_YEARS_TEN);
    badIS[0].noi = NaN;
    (aggregateUnifiedByYear as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {
        yearlyIS: badIS,
        yearlyCF: makeYearlyCF(PROJ_YEARS_TEN),
      },
    );

    const report = await buildSlide6ReportDefinition({
      properties: [makeProperty(1)],
      globalAssumptions: {},
      projectionYears: PROJ_YEARS_TEN,
    });
    const section = report.sections[ZERO];
    if (section.kind !== "table") throw new Error("expected table section");
    expect(section.title.toLowerCase()).toContain("incomplete data");
  });
});

// ── `buildSlide6ImageSubstitutionEntry` — substitution-entry contract ───────

describe("buildSlide6ImageSubstitutionEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMockDeps(
    overrides: {
      reportSections?: number;
      pngBuffer?: Buffer;
      loadPropertyResult?: Slide6PropertyRow | null;
    } = {},
  ) {
    const pngBuffer =
      overrides.pngBuffer ??
      Buffer.from("\x89PNG\r\n\x1a\nfake-png-bytes", "binary");
    const fakeReport: ReportDefinition = {
      cover: {
        companyName: "Test",
        entityName: "Portfolio",
        reportTitle: "Test",
        date: "",
      },
      tokens: {
        primary: "#000",
        secondary: "#000",
        accent: "#000",
        foreground: "#000",
        border: "#000",
        muted: "#000",
        surface: "#000",
        background: "#000",
        white: "#fff",
        negativeRed: "#f00",
        chart: [],
        line: [],
      },
      orientation: "landscape",
      sections: Array.from({ length: overrides.reportSections ?? 1 }, () => ({
        kind: "table" as const,
        title: "T",
        years: ["Yr 1"],
        rows: [],
      })),
    };
    return {
      loadProperty: vi.fn().mockResolvedValue(
        overrides.loadPropertyResult === undefined
          ? makeProperty(1)
          : overrides.loadPropertyResult,
      ),
      loadGlobalAssumptions: vi.fn().mockResolvedValue({}),
      buildReport: vi.fn().mockResolvedValue(fakeReport),
      renderPng: vi.fn().mockResolvedValue(pngBuffer),
    };
  }

  it("returns a SubstitutionEntry shaped per the U4 image-payload contract", async () => {
    const deps = makeMockDeps();
    const entry = await buildSlide6ImageSubstitutionEntry(
      { propertyIds: [1, 2, 3] },
      deps,
    );

    expect(entry.slideNumber).toBe(SLIDE_6_SLIDE_NUMBER);
    expect(entry.op).toBe("image");
    expect(entry.shapeId).toBe(SLIDE_6_PICTURE_SHAPE_NAME);
    if (entry.op !== "image") throw new Error("expected image op");
    expect(entry.payload.mimeType).toBe(SLIDE_6_IMAGE_MIME_TYPE);
    expect(entry.payload.fitMode).toBe("letterbox");
    expect(Buffer.isBuffer(entry.payload.image)).toBe(true);
    expect(entry.payload.image.length).toBeGreaterThan(ZERO);
  });

  it("honors a caller-supplied pictureShapeName override", async () => {
    const deps = makeMockDeps();
    const overrideName = "Picture 42";
    const entry = await buildSlide6ImageSubstitutionEntry(
      { propertyIds: [1], pictureShapeName: overrideName },
      deps,
    );
    expect(entry.shapeId).toBe(overrideName);
  });

  it("invokes the renderer once with the report from the builder", async () => {
    const deps = makeMockDeps();
    await buildSlide6ImageSubstitutionEntry({ propertyIds: [1] }, deps);
    expect(deps.buildReport).toHaveBeenCalledTimes(ONE);
    expect(deps.renderPng).toHaveBeenCalledTimes(ONE);
    // Renderer receives the builder's report
    const rendererInput = deps.renderPng.mock.calls[ZERO][ZERO];
    expect(rendererInput).toBeDefined();
  });

  it("fails closed (rejects) when loadProperty returns null for any id", async () => {
    // CR rev2 on PR #120 (slide-6-report-builder.ts:415): a null return is
    // treated as a load failure, not a "skip this property" signal. The
    // builder rejects with `Slide6PropertyLoadError` naming the offending id.
    const deps = makeMockDeps({ loadPropertyResult: null });
    const FIRST_ID = 1;
    await expect(
      buildSlide6ImageSubstitutionEntry({ propertyIds: [FIRST_ID, 2, 3] }, deps),
    ).rejects.toMatchObject({
      name: "Slide6PropertyLoadError",
      propertyId: FIRST_ID,
    });
    expect(deps.buildReport).not.toHaveBeenCalled();
  });

  it("fails closed (rejects) when loadProperty throws for any id", async () => {
    // CR rev2 on PR #120 (slide-6-report-builder.ts:415): an exception from
    // loadProperty is rethrown as `Slide6PropertyLoadError` so the failing
    // id is surfaced in the run record.
    const deps = makeMockDeps();
    const FAILING_ID = 99;
    deps.loadProperty = vi
      .fn()
      .mockRejectedValue(new Error("storage offline"));
    await expect(
      buildSlide6ImageSubstitutionEntry({ propertyIds: [FAILING_ID] }, deps),
    ).rejects.toMatchObject({
      name: "Slide6PropertyLoadError",
      propertyId: FAILING_ID,
    });
    expect(deps.buildReport).not.toHaveBeenCalled();
  });

  it("threads projectionYearsOverride into the builder when provided", async () => {
    const deps = makeMockDeps();
    await buildSlide6ImageSubstitutionEntry(
      { propertyIds: [1], projectionYearsOverride: PROJ_YEARS_FIVE },
      deps,
    );
    const builderArg = deps.buildReport.mock.calls[ZERO][ZERO];
    expect(builderArg.projectionYears).toBe(PROJ_YEARS_FIVE);
  });
});
