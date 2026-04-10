import { vi } from "vitest";
import type { YearlyPropertyFinancials } from "../../../client/src/lib/financial/yearlyAggregator";

// ---------------------------------------------------------------------------
// makeBrowserDownloadMocks
// Shared across csv-export, csv-edge-cases, and dashboard-exports tests.
// Call install() in beforeEach, uninstall() in afterEach.
// ---------------------------------------------------------------------------

export function makeBrowserDownloadMocks() {
  let _mockLink: {
    href: string;
    download: string;
    click: ReturnType<typeof vi.fn>;
    style: { display: string };
  } = { href: "", download: "", click: vi.fn(), style: { display: "" } };
  let _capturedBlob: Blob | null = null;
  let _mockRevokeObjectURL: ReturnType<typeof vi.fn> = vi.fn();

  const install = () => {
    _capturedBlob = null;
    _mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
      style: { display: "" },
    };
    (globalThis as any).document = {
      createElement: vi.fn().mockReturnValue(_mockLink),
      body: {
        appendChild: vi.fn().mockReturnValue(_mockLink),
        removeChild: vi.fn().mockReturnValue(_mockLink),
      },
    };
    _mockRevokeObjectURL = vi.fn();
    (URL as any).createObjectURL = vi.fn((blob: Blob) => {
      _capturedBlob = blob;
      return "blob:http://test/abc123";
    });
    (URL as any).revokeObjectURL = _mockRevokeObjectURL;
  };

  const uninstall = () => {
    delete (globalThis as any).document;
  };

  return {
    get mockLink() { return _mockLink; },
    get capturedBlob() { return _capturedBlob; },
    get mockRevokeObjectURL() { return _mockRevokeObjectURL; },
    install,
    uninstall,
  };
}

// ---------------------------------------------------------------------------
// makeYearlyData
// 50-field yearly property financial fixture used by Excel row builder tests.
// ---------------------------------------------------------------------------

export function makeYearlyData(
  yearCount: number,
  startYear = 2027,
): (YearlyPropertyFinancials & { label: string })[] {
  return Array.from({ length: yearCount }, (_, i) => ({
    year: i,
    label: String(startYear + i),
    soldRooms: 5000 + i * 200,
    availableRooms: 7320,
    cleanAdr: 330 + i * 10,
    revenueRooms: 1650000 + i * 100000,
    revenueEvents: 400000 + i * 30000,
    revenueFB: 350000 + i * 20000,
    revenueOther: 100000 + i * 5000,
    revenueTotal: 2500000 + i * 155000,
    expenseRooms: 600000 + i * 30000,
    expenseFB: 100000 + i * 8000,
    expenseEvents: 260000 + i * 15000,
    expenseOther: 60000 + i * 3000,
    expenseOtherCosts: 50000 + i * 2000,
    expensePlatformFees: 0,
    expensePreOpening: 0,
    expenseMarketing: 125000 + i * 7000,
    expensePropertyOps: 100000 + i * 5000,
    expenseUtilitiesVar: 90000 + i * 4000,
    expenseUtilitiesFixed: 35000 + i * 1000,
    expenseUtilities: 125000 + i * 5000,
    expenseAdmin: 200000 + i * 10000,
    expenseIT: 50000 + i * 2000,
    expenseTaxes: 60000 + i * 2000,
    expenseFFE: 100000 + i * 6000,
    feeBase: 125000 + i * 7000,
    feeIncentive: 80000 + i * 5000,
    totalExpenses: 1800000 + i * 100000,
    gop: 900000 + i * 55000,
    noi: 500000 + i * 30000,
    interestExpense: 50000 - i * 1000,
    depreciationExpense: 27273,
    incomeTax: 100000 + i * 5000,
    netIncome: 320000 + i * 25000,
    principalPayment: 20000 + i * 500,
    debtPayment: 70000 - i * 500,
    refinancingProceeds: 0,
    cashFlow: 250000 + i * 20000,
    operatingCashFlow: 350000 + i * 25000,
    financingCashFlow: -70000 + i * 500,
    endingCash: 250000 + i * 270000,
  }));
}

// ---------------------------------------------------------------------------
// makeYearlyFinancials
// Portfolio-level yearly financial fixture used by dashboard export tests.
// ---------------------------------------------------------------------------

export function makeYearlyFinancials(
  overrides: Partial<YearlyPropertyFinancials> = {},
): YearlyPropertyFinancials {
  return {
    availableRooms: 36500,
    soldRooms: 29200,
    revenueRooms: 4380000,
    revenueFB: 1200000,
    revenueEvents: 300000,
    revenueOther: 150000,
    revenueTotal: 6030000,
    expenseRooms: 876000,
    expenseFB: 600000,
    expenseEvents: 120000,
    expenseOther: 75000,
    expenseMarketing: 181000,
    expensePropertyOps: 241200,
    expenseAdmin: 301500,
    expenseIT: 90000,
    expenseInsurance: 120000,
    expenseUtilitiesVar: 60000,
    expenseUtilitiesFixed: 36000,
    expenseOtherCosts: 30000,
    expensePlatformFees: 0,
    expensePreOpening: 0,
    totalExpenses: 2730700,
    gop: 3299300,
    feeBase: 180900,
    feeIncentive: 65000,
    agop: 3053400,
    expenseTaxes: 150000,
    noi: 2903400,
    expenseFFE: 120600,
    anoi: 2782800,
    interestExpense: 400000,
    depreciationExpense: 200000,
    incomeTax: 50000,
    netIncome: 2132800,
    principalPayment: 100000,
    debtPayment: 500000,
    operatingCashFlow: 2332800,
    cashFlow: 1832800,
    endingCash: 2332800,
    debtOutstanding: 5000000,
    serviceFeesByCategory: {},
    refinancingProceeds: 0,
    ...overrides,
  } as YearlyPropertyFinancials;
}

// ---------------------------------------------------------------------------
// makeTableRows
// PPTX table row fixture used by pptx tests.
// ---------------------------------------------------------------------------

export function makeTableRows(yearCount: number) {
  const years = Array.from({ length: yearCount }, (_, i) => `Year ${i + 1}`);
  const rows = [
    { category: "REVENUE", values: years.map(() => 0), isBold: false },
    { category: "  Room Revenue", values: years.map((_, i) => 500000 + i * 50000) },
    { category: "  F&B Revenue", values: years.map((_, i) => 100000 + i * 10000) },
    { category: "Total Revenue", values: years.map((_, i) => 600000 + i * 60000), isBold: true },
    { category: "Adjusted NOI (ANOI)", values: years.map((_, i) => 200000 + i * 20000), isBold: true },
  ];
  return { years, rows };
}
