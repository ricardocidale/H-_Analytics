# Chapter 8: Export System

Every financial data page in the platform includes an Export Menu — a dropdown button offering multiple output formats. The checker should use exports extensively to verify calculations outside the application, as they provide the raw numeric values needed for independent cross-checking against the formulas described throughout this manual.

---

## Available Export Formats

The platform supports six export formats, each suited to different verification and presentation needs:

| Format | Extension | Best For | Key Characteristics |
|--------|-----------|----------|-------------------|
| PDF | .pdf | Formal reports, investor presentations | Formatted tables matching on-screen display; includes headers and branding |
| Excel | .xlsx | Offline analysis, formula verification | Separate worksheet per statement; raw numeric values; column headers preserved |
| CSV | .csv | Data import to other tools | Flat file format; no formatting; ideal for loading into independent spreadsheets |
| PowerPoint | .pptx | Investor presentations | Follows Hospitality Business branding (sage green palette, dark backgrounds); one slide per statement |
| Chart PNG | .png | Embedding charts in documents | Rasterized chart image at screen resolution; white background |
| Table PNG | .png | Embedding tables in documents | Rasterized table image matching on-screen rendering |

---

## Export Availability

The Export Menu appears as a dropdown button on every financial data page, including Property Income Statement, Property Cash Flow Statement, Property Balance Sheet, Management Company financials, Consolidated Portfolio statements, Investment Analysis, Dashboard KPI views, Financing Analysis, and Sensitivity Analysis.

---

## Format Details

**PDF Export** generates a formatted document matching the on-screen table layout. It includes page headers with the property or entity name and date range, and uses the same column structure as the interface display. This format is suitable for formal deliverables and board presentations.

**Excel Export** places each financial statement on a separate worksheet (tab). Column headers include year labels matching the fiscal year configuration. Numeric values are exported as raw numbers rather than formatted strings. Formulas are not embedded — values are static snapshots. This is the best format for independent calculation verification.

**CSV Export** produces a single flat file with comma-separated values. It includes no formatting, styles, or multiple sheets, making it ideal for importing into a separate spreadsheet application for independent recalculation.

**PowerPoint Export** creates presentation-ready slides following Hospitality Business branding, with the sage green color scheme and dark backgrounds. Each major financial statement or chart appears on its own slide.

**Chart PNG Export** captures the rendered chart as an image file, including axis labels, legends, and data point markers.

**Table PNG Export** captures the rendered financial table as an image file, preserving all formatting, row grouping, and highlighting.

---

## Recommended Verification Workflow

The checker should follow this export-based verification process:

| Step | Action | Format |
|------|--------|--------|
| 1 | Export the statement you want to verify | Excel (.xlsx) |
| 2 | Open in a spreadsheet application | — |
| 3 | Rebuild the calculation independently using the formulas described in this manual | — |
| 4 | Compare your independent calculation to the exported values | — |
| 5 | Flag any discrepancy exceeding rounding tolerance (±$1) | — |
| 6 | Export a PDF for visual comparison against the on-screen display | PDF (.pdf) |

---

## Full Data Export (Checker and Admin Only)

The Full Data Export is a privileged function accessible only to users with the checker or admin role. It produces a comprehensive PDF containing all global assumptions, all property configurations and assumptions, income statements for all properties, cash flow statements for all properties, balance sheets for all properties, the Management Company income statement and cash flow, consolidated portfolio-level statements, and investment analysis metrics including IRR, equity multiple, and FCF/FCFE series.

This export serves as the master reference document for comprehensive verification. The checker should generate a Full Data Export before beginning any systematic verification session.

---

## Checker Export Checklist

| Check | Description |
|-------|-------------|
| ☐ | Export Menu dropdown appears on all financial data pages |
| ☐ | All 6 formats are available in the dropdown |
| ☐ | Excel export contains separate sheets per statement |
| ☐ | CSV export opens correctly in external spreadsheet |
| ☐ | PDF tables match on-screen display |
| ☐ | PowerPoint uses correct Hospitality Business branding colors |
| ☐ | Chart PNG captures the full chart with legend |
| ☐ | Table PNG captures the full table with headers |
| ☐ | Full Data Export is accessible with checker role |
| ☐ | Full Data Export PDF contains all expected sections |
