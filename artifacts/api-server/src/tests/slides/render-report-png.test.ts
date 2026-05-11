/**
 * Factory v2 U5 — `renderReportToPng` shared module tests.
 *
 * Two layers of coverage:
 *
 *   1. Pure HTML-build tests (always run): exercise `buildReportHtml` to verify
 *      the generic `ReportDefinition` → HTML mapping behaves correctly for the
 *      USALI use case, varying column counts, and the empty-report edge case.
 *      No Playwright required — these are deterministic snapshot-style
 *      assertions on the HTML string.
 *
 *   2. Playwright PNG-render tests (mocked): inject a fake `getBrowser()` and
 *      assert that `renderReportToPng` wires the viewport, DPR, content, and
 *      screenshot call correctly. The real Chromium is never launched.
 *
 * Characterization note for the build-lb-payload refactor: the prior inline
 * `renderUsaliTablePng` consumed `(YearlyIS[], YearlyCF[], projYears)` and
 * returned a base64 string. U5 introduced an adapter
 * (`buildUsaliReportDefinition` in build-lb-payload.ts) that shapes the same
 * inputs into a `ReportDefinition` and calls the generic renderer. This test
 * file verifies the generic renderer; the adapter is verified indirectly via
 * the existing build-lb-payload integration tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("../../slides/playwright-browser", () => ({
  getBrowser: vi.fn(),
}));

import { getBrowser } from "../../slides/playwright-browser";
import {
  buildReportHtml,
  renderReportToPng,
  DEFAULT_REPORT_WIDTH_PX,
  DEFAULT_REPORT_HEIGHT_PX,
  DEFAULT_REPORT_DPR,
} from "../../slides/render-report-png";
import type {
  ReportDefinition,
  TableRow,
  TableSection,
} from "../../report/types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_PNG = Buffer.from("\x89PNG\r\n\x1a\nFAKE", "binary");
const NON_DEFAULT_WIDTH = 800;
const NON_DEFAULT_HEIGHT = 400;
const NON_DEFAULT_DPR = 3;
const PROJ_YEARS_FIVE = 5;
const PROJ_YEARS_TEN = 10;
const ZERO = 0;

const PLACEHOLDER_TOKENS = {
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
  chart: [] as string[],
  line: [] as string[],
};

function makeFakePage() {
  return {
    setContent: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(FAKE_PNG),
  };
}

function makeFakeContext(page: ReturnType<typeof makeFakePage>) {
  return {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFakeBrowser(context: ReturnType<typeof makeFakeContext>) {
  return {
    newContext: vi.fn().mockResolvedValue(context),
  };
}

function wireBrowser(browser: ReturnType<typeof makeFakeBrowser>) {
  (getBrowser as unknown as Mock).mockResolvedValue(browser);
}

function row(
  category: string,
  vals: number[],
  type: TableRow["type"] = "data",
  format?: string,
): TableRow {
  return {
    category,
    values: vals.map((v) => ({ raw: v, text: `$${v}`, negative: v < ZERO })),
    rawValues: vals,
    type,
    indent: ZERO,
    ...(format ? { format } : {}),
  };
}

function makeReport(years: number, extraSections: TableSection[] = []): ReportDefinition {
  const yearLabels = Array.from({ length: years }, (_, i) => `Yr ${i + 1}`);
  const numericRow = (label: string, type: TableRow["type"] = "data", format?: string): TableRow =>
    row(
      label,
      Array.from({ length: years }, (_, i) => (i + 1) * 1000),
      type,
      format,
    );

  const mainSection: TableSection = {
    kind: "table",
    title: `${years}-Year Pro Forma`,
    years: yearLabels,
    rows: [
      numericRow("Revenue"),
      numericRow("Operating Expenses"),
      numericRow("GOP", "subtotal"),
      numericRow("NOI", "total"),
      numericRow("Debt Service", "data", "section-break"),
      numericRow("Cumulative", "data", "cumul"),
    ],
  };

  return {
    cover: {
      companyName: "Test Co",
      entityName: "Portfolio",
      reportTitle: `${years}-Year Pro Forma`,
      date: "",
    },
    tokens: PLACEHOLDER_TOKENS,
    orientation: "landscape",
    sections: [mainSection, ...extraSections],
  };
}

// ── Pure HTML-build tests (always run) ───────────────────────────────────────

describe("buildReportHtml", () => {
  it("renders a TableSection with header row + body rows + class mapping", () => {
    const html = buildReportHtml(makeReport(PROJ_YEARS_FIVE));

    // Title surfaces in the section
    expect(html).toContain(`${PROJ_YEARS_FIVE}-Year Pro Forma`);

    // Year columns render as <th>
    expect(html).toContain("<th>Yr 1</th>");
    expect(html).toContain(`<th>Yr ${PROJ_YEARS_FIVE}</th>`);

    // Row class mapping
    expect(html).toMatch(/class="row-total"[^>]*>\s*<td>NOI<\/td>/);
    expect(html).toMatch(/class="row-subtotal"[^>]*>\s*<td>GOP<\/td>/);
    expect(html).toMatch(/class="row-section-break"[^>]*>\s*<td>Debt Service<\/td>/);
    expect(html).toMatch(/class="row-cumul"[^>]*>\s*<td>Cumulative<\/td>/);

    // Default `data` row gets an empty class attribute (no class tokens applied)
    expect(html).toMatch(/class=""[^>]*>\s*<td>Revenue<\/td>/);
  });

  it("scales correctly to 10-year column count without overflow markers", () => {
    const html = buildReportHtml(makeReport(PROJ_YEARS_TEN));

    // All 10 column headers should render
    for (let i = 1; i <= PROJ_YEARS_TEN; i++) {
      expect(html).toContain(`<th>Yr ${i}</th>`);
    }

    // Each row should have exactly `years + 1` <td>s (label + N year cells).
    // Verify by counting Revenue row's cells.
    const revenueRowMatch = html.match(/<tr class="[^"]*"[^>]*>\s*<td>Revenue<\/td>([\s\S]*?)<\/tr>/);
    expect(revenueRowMatch).not.toBeNull();
    const tdCount = (revenueRowMatch![1].match(/<td>/g) ?? []).length;
    expect(tdCount).toBe(PROJ_YEARS_TEN);
  });

  it("renders the empty-report placeholder rather than throwing", () => {
    const report: ReportDefinition = {
      cover: {
        companyName: "Empty Co",
        entityName: "Nothing",
        reportTitle: "Empty Report",
        date: "",
      },
      tokens: PLACEHOLDER_TOKENS,
      orientation: "landscape",
      sections: [],
    };

    const html = buildReportHtml(report);

    expect(html).toContain("Empty Report");
    expect(html).toContain("No data");
    // Placeholder visual class is present
    expect(html).toMatch(/class="placeholder"/);
  });

  it("escapes user-provided strings to prevent HTML injection", () => {
    const report: ReportDefinition = {
      cover: {
        companyName: "X",
        entityName: "Y",
        reportTitle: '<script>alert("xss")</script>',
        date: "",
      },
      tokens: PLACEHOLDER_TOKENS,
      orientation: "landscape",
      sections: [],
    };

    const html = buildReportHtml(report);

    // The literal <script> tag should NOT appear unescaped in the body
    expect(html).not.toContain('<script>alert("xss")</script>');
    // It should appear escaped
    expect(html).toContain("&lt;script&gt;");
  });
});

// ── Playwright PNG-render tests (mocked) ─────────────────────────────────────

describe("renderReportToPng", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a non-empty PNG buffer for a happy-path ReportDefinition", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);
    wireBrowser(browser);

    const result = await renderReportToPng(makeReport(PROJ_YEARS_FIVE));

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(ZERO);
    expect(result).toEqual(FAKE_PNG);
  });

  it("uses the documented default width/height/DPR when no options passed", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);
    wireBrowser(browser);

    await renderReportToPng(makeReport(PROJ_YEARS_FIVE));

    expect(browser.newContext).toHaveBeenCalledWith({
      viewport: { width: DEFAULT_REPORT_WIDTH_PX, height: DEFAULT_REPORT_HEIGHT_PX },
      deviceScaleFactor: DEFAULT_REPORT_DPR,
    });
  });

  it("respects explicit widthPx / heightPx / dpr overrides", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);
    wireBrowser(browser);

    await renderReportToPng(makeReport(PROJ_YEARS_FIVE), {
      widthPx: NON_DEFAULT_WIDTH,
      heightPx: NON_DEFAULT_HEIGHT,
      dpr: NON_DEFAULT_DPR,
    });

    expect(browser.newContext).toHaveBeenCalledWith({
      viewport: { width: NON_DEFAULT_WIDTH, height: NON_DEFAULT_HEIGHT },
      deviceScaleFactor: NON_DEFAULT_DPR,
    });
  });

  it("invokes setContent with the buildReportHtml output and a fullPage screenshot", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);
    wireBrowser(browser);

    const report = makeReport(PROJ_YEARS_FIVE);
    await renderReportToPng(report);

    // Content matches the pure HTML builder's output
    expect(page.setContent).toHaveBeenCalledTimes(1);
    const passedHtml = (page.setContent as unknown as Mock).mock.calls[0][0];
    expect(passedHtml).toBe(buildReportHtml(report));

    // Screenshot is fullPage + png type
    expect(page.screenshot).toHaveBeenCalledWith({ fullPage: true, type: "png" });
  });

  it("closes the Playwright context even when screenshot succeeds", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);
    wireBrowser(browser);

    await renderReportToPng(makeReport(PROJ_YEARS_FIVE));

    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  it("renders an empty report (zero sections) without throwing", async () => {
    const page = makeFakePage();
    const ctx = makeFakeContext(page);
    const browser = makeFakeBrowser(ctx);
    wireBrowser(browser);

    const empty: ReportDefinition = {
      cover: { companyName: "X", entityName: "Y", reportTitle: "Empty", date: "" },
      tokens: PLACEHOLDER_TOKENS,
      orientation: "landscape",
      sections: [],
    };

    const result = await renderReportToPng(empty);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(ZERO);
    // The placeholder HTML was passed to setContent
    const passedHtml = (page.setContent as unknown as Mock).mock.calls[0][0];
    expect(passedHtml).toContain("No data");
  });
});
