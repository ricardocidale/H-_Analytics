import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";
  import { Callout } from "@/components/ui/callout";
  import { IconHelp } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section21Glossary({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="glossary"
        title="21. Glossary"
        icon={IconHelp}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <ManualTable
          headers={["Term", "Definition", "Formula Ref", "Category"]}
          rows={[
            ["ADR (Average Daily Rate)", "Average revenue earned per occupied room per day", "F-P-03", "Revenue"],
            ["AGOP (Adjusted Gross Operating Profit)", "GOP minus management fees (base + incentive). Isolates property-level performance after management compensation", "F-P-09a", "Profitability"],
            ["Amortization", "Gradual repayment of loan principal over time via scheduled payments", "F-F-01", "Financing"],
            ["ASC 230", "GAAP standard governing Statement of Cash Flows", "—", "Accounting Standard"],
            ["ASC 310-20", "GAAP standard for loan origination costs; capitalized and amortized over loan term", "—", "Accounting Standard"],
            ["ASC 360", "GAAP standard for property depreciation and impairment", "F-P-13", "Accounting Standard"],
            ["ASC 470", "GAAP standard for debt accounting and classification", "—", "Accounting Standard"],
            ["ASC 606", "GAAP revenue recognition standard; point-in-time vs. over-time; bundled package allocation", "—", "Accounting Standard"],
            ["ASC 805", "GAAP standard for business combinations and acquisition cost measurement", "—", "Accounting Standard"],
            ["ASC 810", "GAAP consolidation standard; inter-company elimination entries. Management fees charged to properties are eliminated on the consolidated income statement", "F-C-11", "Accounting Standard"],
            ["ATCF (After-Tax Cash Flow)", "Cash remaining after operating expenses, debt service, and taxes", "F-R-02", "Returns"],
            ["Balance Sheet", "Point-in-time snapshot of assets, liabilities, and equity", "—", "Financial Statement"],
            ["Base Management Fee", "Percentage of total property revenue paid to management company", "F-C-01", "Fees"],
            ["Boutique Hotel", "Independently owned, typically 10–80 rooms, with F&B and events", "—", "Property Type"],
            ["Building Improvements", "Capital expenditures to improve property post-acquisition", "—", "Capital"],
            ["Cap Rate", "NOI / Property Value; used to value income-producing real estate", "F-R-05", "Valuation"],
            ["Cash from Financing (CFF)", "Cash flows from debt, equity, and distributions", "F-P-19", "Cash Flow"],
            ["Cash from Investing (CFI)", "Cash flows from property acquisition/disposition", "F-P-18", "Cash Flow"],
            ["Cash from Operations (CFO)", "Cash generated from core business operations", "F-P-17", "Cash Flow"],
            ["Catering Boost", "Historical uplift factor for F&B revenue. Deprecated in current engine — F&B share now directly represents target % of total revenue. Field retained for backward compatibility but set to 0 by default", "F-P-05", "Revenue"],
            ["Closing Costs", "Fees/expenses associated with finalizing a loan (% of loan amount)", "F-F-02", "Financing"],
            ["Cost Segregation", "IRS-approved method of accelerating depreciation by reclassifying building components (e.g., FF&E, land improvements) into shorter MACRS recovery periods (5, 7, or 15 years vs. 39 years). Not modeled but may reduce effective tax burden", "F-P-14", "Tax Strategy"],
            ["Day Count Convention", "The method used to standardize the number of days in a month for financial calculations. This model uses 30.5 days/month (365 ÷ 12, rounded) per hospitality industry convention", "F-P-01", "Assumptions"],
            ["DCF (Discounted Cash Flow)", "Valuation method summing present value of projected cash flows", "—", "Valuation"],
            ["Debt Service", "Total loan payment combining interest and principal = PMT", "F-F-04", "Financing"],
            ["Depreciable Basis", "Portion of property value subject to depreciation", "F-P-13", "Depreciation"],
            ["Depreciation", "Non-cash expense allocating building cost over 39 years (straight-line)", "F-P-14", "Depreciation"],
            ["DSCR", "Debt Service Coverage Ratio = ANOI / Annual Debt Service", "—", "Financing"],
            ["EBITDA", "Earnings Before Interest, Taxes, Depreciation, and Amortization. Common metric for valuing asset-light management companies", "F-C-09a", "Profitability"],
            ["Equity Invested", "Total capital contributed by equity investors = Total Cost − Loan", "F-R-03", "Returns"],
            ["Equity Multiple (MOIC)", "Total Distributions / Total Equity Invested", "F-R-04", "Returns"],
            ["Exit Cap Rate", "Cap rate used to value property at disposition/sale", "F-R-05", "Valuation"],
            ["Exit Proceeds", "Net cash at property sale = Gross Value − Commission − Debt", "F-R-06", "Returns"],
            ["FCFE (Free Cash Flow to Equity)", "Cash available to equity holders after debt", "F-R-02", "Returns"],
            ["FCF (Free Cash Flow)", "Cash from operations minus capital expenditures", "F-R-01", "Returns"],
            ["FF&E", "Furniture, Fixtures & Equipment reserve (typically 4% of revenue)", "—", "Capital"],
            ["Fiscal Year", "12-month accounting period; configurable start month", "—", "Accounting"],
            ["Fixed Cost Escalation", "Annual compound growth rate applied to all fixed overhead costs (office lease, professional services, tech infrastructure). Defaults to the system inflation rate when not explicitly overridden", "F-C-06", "Assumptions"],
            ["GAAP", "Generally Accepted Accounting Principles (US framework)", "—", "Accounting Standard"],
            ["GAAP Badge", "Blue inline icon (ⓘ) showing the GAAP or IRS rule governing an assumption field; hover to view", "—", "UI"],
            ["GOP (Gross Operating Profit)", "Total Revenue − Total Operating Expenses", "F-P-09", "Profitability"],
            ["Gross Disposition Value", "Property sale price = Terminal NOI / Exit Cap Rate", "F-R-05", "Valuation"],
            ["HMA", "Hotel Management Agreement defining fee structure", "—", "Legal"],
            ["Incentive Management Fee", "Performance-based fee calculated on GOP", "F-C-02", "Fees"],
            ["Income Statement (P&L)", "Statement showing revenue, expenses, and net income over a period", "—", "Financial Statement"],
            ["Inflation Rate", "Annual rate of general price increase; affects variable costs", "—", "Assumptions"],
            ["Intercompany Elimination", "The process of removing management fees from the consolidated income statement. Base and incentive fees are revenue to the management company and an expense to each property — on consolidation these cancel to zero per ASC 810", "F-C-11", "Accounting"],
            ["IRC §164", "IRS code: property taxes fully deductible as operating expense; based on assessed value", "—", "Tax Code"],
            ["IRC §168", "IRS code: MACRS depreciation; 39-year straight-line for nonresidential real property (hotels)", "F-P-14", "Tax Code"],
            ["IRC §172", "IRS code: Net Operating Loss (NOL) carryforward provisions. Losses can offset future taxable income, reducing effective tax rate in recovery years", "F-P-16a", "Tax Code"],
            ["IRC §1001", "IRS code: amount realized on sale = gross proceeds minus selling expenses (commission)", "F-R-06", "Tax Code"],
            ["IRC §1250", "IRS code: depreciation recapture on sale of real property; taxed at up to 25%", "F-R-06", "Tax Code"],
            ["IRR (Internal Rate of Return)", "Discount rate making NPV of cash flows equal to zero", "F-R-04", "Returns"],
            ["IRS Pub 946", "IRS publication on depreciation: land is non-depreciable; buildings use 39-year life", "F-P-13", "Tax Code"],
            ["Land Value Percent", "Portion of purchase price allocated to land (non-depreciable per IRS Pub 946)", "F-P-13", "Depreciation"],
            ["LTV (Loan-to-Value)", "Ratio of loan amount to property purchase price", "F-F-01", "Financing"],
            ["Management Company", "Asset-light service entity earning fees from managed properties", "—", "Entity"],
            ["MOIC", "Multiple on Invested Capital (see Equity Multiple)", "F-R-04", "Returns"],
            ["Monthly Depreciation", "Depreciable Basis / 39 / 12", "F-P-14", "Depreciation"],
            ["Net Income", "ANOI − Interest − Depreciation − Income Tax", "F-P-16", "Profitability"],
            ["NOI (Net Operating Income)", "AGOP − Property Taxes. In this engine, management fees are deducted before NOI (via AGOP), then property taxes are subtracted", "F-P-10", "Profitability"],
            ["NOL (Net Operating Loss)", "When taxable income is negative, the loss is carried forward to offset future taxable income per IRC §172. The model tracks cumulative NOL and applies it automatically in profitable periods", "F-P-16a", "Tax"],
            ["ANOI (Adjusted NOI)", "NOI − FF&E Reserve. Management fees are already deducted before NOI (in the AGOP step)", "F-P-11", "Profitability"],
            ["Occupancy Ramp", "The gradual increase in occupancy from opening day to stabilized levels. New hotels don't fill instantly — occupancy grows in steps (e.g., every 6 months) until reaching the target maximum. Industry standard: 24–36 months to stabilization for boutique hotels", "F-P-03", "Revenue"],
            ["Occupancy Rate", "Percentage of available rooms sold; ramps from start to max", "—", "Revenue"],
            ["Operating Reserve", "Cash set aside at acquisition to cover initial working capital needs (pre-revenue operating expenses, deposits, initial inventory). Typically 2–4 months of projected operating expenses", "—", "Capital"],
            ["PMT", "Loan payment formula = P × [r(1+r)^n / ((1+r)^n − 1)]", "F-F-04", "Financing"],
            ["Pre-Opening Costs", "Expenses before property begins operations", "—", "Capital"],
            ["Pro Forma", "Projected financial statements based on assumptions", "—", "Financial Statement"],
            ["Projection Period", "Number of years modeled (configurable, default 10)", "—", "Assumptions"],
            ["Purchase Price", "Acquisition cost of the property asset", "—", "Capital"],
            ["Benchmark Range Label", "Light yellow inline label showing AI-researched market range (e.g., 55%-70%); hover for source and date; click to auto-fill recommended value", "—", "UI"],
            ["Refinancing", "Replacing existing debt with new loan, typically post-stabilization", "F-F-06", "Financing"],
            ["Refi Proceeds", "Net cash from refinancing = New Loan − Old Balance − Costs", "F-F-07", "Financing"],
            ["Revenue Share", "The percentage of total revenue allocated to an ancillary income stream (events, F&B, other). Revenue shares must sum to less than 100% — the remainder is room revenue. Each property can override the system default. Used to model the revenue mix without requiring separate demand forecasts for each stream", "F-P-04", "Revenue"],
            ["RevPAR", "Revenue Per Available Room = ADR × Occupancy", "—", "Revenue"],
            ["Room Revenue", "ADR × Sold Rooms", "F-P-03", "Revenue"],
            ["SAFE / Convertible Note", "Early-stage funding instruments that convert to equity at a future priced round. SAFE (Simple Agreement for Future Equity) has a valuation cap and optional discount rate. Convertible Notes add an interest rate and maturity date. Both are modeled with configurable terms", "F-F-10", "Funding"],
            ["Funding Instrument", "Configurable funding instrument (e.g., SAFE, Convertible Note, Seed, Series A). Valuation cap and discount rate are optional.", "F-F-10", "Funding"],
            ["Scenario", "Saved snapshot of all assumptions and property configurations", "—", "System"],
            ["SPV (Special Purpose Vehicle)", "Legal entity isolating each property's financial risk", "—", "Legal"],
            ["Stabilization", "Period when property reaches target occupancy (12–24 months)", "—", "Operations"],
            ["Staffing Tiers", "Portfolio-based staffing model where management company headcount increases in discrete steps as more properties are added. Default tiers: ≤3 properties → 2.5 FTE, ≤6 → 4.5 FTE, 7+ → 7.0 FTE. Configurable on the Company Assumptions page", "F-C-05", "Operations"],
            ["Straight-Line Depreciation", "Equal depreciation expense each period over useful life", "—", "Depreciation"],
            ["Terminal Year", "Final year of projection period; used for exit valuation", "—", "Valuation"],
            ["Total Property Cost", "Purchase + Improvements + Pre-Opening + Reserve + Closing", "F-F-03", "Capital"],
            ["USALI", "Uniform System of Accounts for the Lodging Industry (12th Edition). The standard chart of accounts and income statement ordering for hotels. This engine's waterfall: Revenue → Operating Expenses → GOP → Management Fees → AGOP → Property Taxes → NOI → FF&E → ANOI", "—", "Accounting Standard"],
            ["Utilities Variable Split", "The fraction of total utility cost that scales with occupancy (variable) versus remains constant regardless of guests (fixed). Default 60% variable / 40% fixed. Set at the system level and applies to all properties", "F-P-08", "Expenses"],
            ["Variable Costs", "Operating expenses that scale with revenue/occupancy", "—", "Expenses"],
            ["Working Capital", "See Operating Reserve. Cash needed to fund day-to-day operations before revenue stabilizes", "—", "Capital"],

            ["Chain Scale (Luxury)", "STR classification: ADR $396+, full-service amenities, high staff-to-room ratio. Examples: Four Seasons, Ritz-Carlton, St. Regis", "—", "Classification"],
            ["Chain Scale (Upper Upscale)", "STR classification: ADR $173–$312, full-service with F&B and meeting space. Examples: Marriott, Hilton, Hyatt", "—", "Classification"],
            ["Chain Scale (Upscale)", "STR classification: ADR $134–$198, select-service or boutique with limited F&B. Examples: Kimpton, Autograph Collection", "—", "Classification"],
            ["Chain Scale (Upper Midscale)", "STR classification: ADR $100–$140, limited-service, economy F&B. Examples: Holiday Inn Express, Hampton Inn", "—", "Classification"],
            ["Business Model (Hotel)", "Traditional hospitality model with USALI departmental accounting. Revenue streams: rooms, F&B, events, other. Management fees based on HMA structure", "—", "Classification"],
            ["Business Model (Lodge)", "Whole-property rental model with seasonal patterns. Revenue based on nightly rate × occupancy. Typically includes guest meals. Lower operating complexity than hotels", "—", "Classification"],
            ["Business Model (VRBO/STR)", "Short-term rental model using platforms (Airbnb, VRBO, Booking.com). Revenue subject to platform fees (8–25%). Higher cleaning turnover costs. ADR typically $100–$1,500", "—", "Classification"],
            ["Platform Fee", "Commission charged by booking platforms (Airbnb, VRBO, Booking.com) on gross bookings. Rates: Airbnb 15.5%, VRBO 8%, Booking 15%, Direct 0%. Only applies to VRBO/STR business model", "—", "Revenue"],
            ["Comparable Set (Comp Set)", "Group of similar properties used for benchmarking. Matched by location, size, type, and chain scale. Progressive relaxation widens criteria when exact matches are scarce", "—", "Research"],
            ["Freshness Threshold", "Configurable age limit (in days) after which research results are flagged as stale. Set in Pipeline Config. Default varies by research tier", "—", "Research"],
            ["Relaxation Trail", "Step-by-step record of how the AI widened its search criteria during progressive relaxation. Shows each constraint that was relaxed and the number of comps found at each stage", "—", "Research"],
            ["Context Pack", "Structured bundle of property data, comparables, market intelligence, and constraints assembled before AI research runs. Previewable in QA Sandbox", "—", "Research"],
            ["Trust Score", "Quality rating assigned to each data source in the Source Registry. Values: Verified (direct API), Estimated (derived/scraped), Unverified (manual/unknown provenance)", "—", "Research"],
          ]}
        />
      </SectionCard>
    );
  }
