import { execSync } from "child_process";
import { header, footer, statusLine } from "./lib/formatter";

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }).trim();
  } catch {
    return "";
  }
}

const issues: string[] = [];
let checks = 0;
let passed = 0;

function check(label: string, ok: boolean, detail?: string) {
  checks++;
  if (ok) {
    passed++;
    statusLine("✓", label, detail ?? "OK", 36);
  } else {
    const msg = detail ?? "FAIL";
    issues.push(`${label}: ${msg}`);
    statusLine("✗", label, msg, 36);
  }
}

header("Export Audit", 50);

const exportDir = "client/src/lib/exports";
const coreFiles = [
  "index.ts",
  "exportStyles.ts",
  "row-builders.ts",
  "csvExport.ts",
  "excelExport.ts",
  "pdfHelpers.ts",
  "pdfChartDrawer.ts",
  "pngExport.ts",
  "pptxExport.ts",
  "saveFile.ts",
  "companyExports.ts",
];

const excelSubFiles = [
  "excel/index.ts",
  "excel/helpers.ts",
  "excel/types.ts",
  "excel/property-sheets.ts",
  "excel/portfolio-sheet.ts",
];

const allExpected = [...coreFiles, ...excelSubFiles];

for (const f of allExpected) {
  const exists = run(`test -f ${exportDir}/${f} && echo yes`).trim() === "yes";
  check(`${f} exists`, exists);
}

const dataGenerators = [
  { fn: "generatePortfolioIncomeData", file: "client/src/components/dashboard/dashboardExports.ts" },
  { fn: "generatePortfolioCashFlowData", file: "client/src/components/dashboard/dashboardExports.ts" },
  { fn: "generatePortfolioBalanceSheetData", file: "client/src/components/dashboard/dashboardExports.ts" },
  { fn: "generatePortfolioInvestmentData", file: "client/src/components/dashboard/dashboardExports.ts" },
  { fn: "exportCompanyPDF", file: "client/src/lib/exports/companyExports.ts" },
  { fn: "exportCompanyCSV", file: "client/src/lib/exports/companyExports.ts" },
];

for (const { fn, file } of dataGenerators) {
  const found = run(`rg -c '\\b${fn}\\b' ${file} 2>/dev/null`);
  check(`Generator ${fn}`, parseInt(found || "0") > 0, `found in ${file.split("/").pop()}`);
}

const formats = ["pdf", "excel", "csv", "pptx", "png"];
const pages = ["Dashboard", "PropertyDetail", "Company"];
const pageFiles: Record<string, string> = {
  Dashboard: "client/src/components/dashboard",
  PropertyDetail: "client/src/pages/PropertyDetail.tsx",
  Company: "client/src/pages/Company.tsx",
};

for (const page of pages) {
  const target = pageFiles[page];
  for (const fmt of formats) {
    const pattern = fmt === "excel" ? "xlsx|excel|Excel" : fmt;
    const found = run(`rg -il '${pattern}' ${target} 2>/dev/null | head -1`);
    check(`${page} → ${fmt}`, !!found, found ? "wired" : "missing");
  }
}

const brandConstants = run(`rg -c 'SECONDARY_HEX|ACCENT_HEX|PRIMARY_HEX' ${exportDir}/exportStyles.ts 2>/dev/null`);
check("Brand palette centralized", parseInt(brandConstants || "0") >= 3, `${brandConstants} refs in exportStyles`);

const rowBuilderExports = run(`rg -c 'export function' ${exportDir}/row-builders.ts 2>/dev/null`);
check("Row-builder helpers", parseInt(rowBuilderExports || "0") >= 5, `${rowBuilderExports} helpers`);

const barrelExports = run(`rg -c 'row-builders' ${exportDir}/index.ts 2>/dev/null`);
check("Row-builders in barrel", parseInt(barrelExports || "0") > 0, "re-exported from index");

const strayAggregators = run(`test -d client/src/lib/financial/aggregators && echo yes`).trim() === "yes";
check("No stray aggregators dir", !strayAggregators, strayAggregators ? "FOUND — should not exist" : "clean");

footer(50);

if (issues.length === 0) {
  console.log(`  ✓ All ${checks} checks passed`);
} else {
  console.log(`  ${passed}/${checks} passed, ${issues.length} issues:`);
  issues.forEach(i => console.log(`    • ${i}`));
}
footer(50);

process.exit(issues.length > 0 ? 1 : 0);
