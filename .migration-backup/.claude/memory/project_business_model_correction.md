# CRITICAL: Business Model — Corrected Understanding

> THIS OVERRIDES ALL PREVIOUS ASSUMPTIONS. Read this before any work on properties, ICP, funding, or management company features.

## Three Distinct Entities

1. **Norfolk AI** = the app developer. Builds H+ Analytics. NOT modeled in the app.
2. **The Hospitality Management Company (HMC)** = the company being modeled. Name is admin-configured and seeded (currently "L+B Hospitality Co"). In code, refer to it as "the management company" or "HMC."
3. **Property SPVs** = each property is an independent entity owned by its own investors.

## What the HMC IS

A **management company and brand** that property owners hire. It provides:
- Brand identity and positioning
- Hotel operations management
- Marketing, reservations, and revenue management
- Accounting and financial reporting
- Technology and IT infrastructure
- Staff training and quality assurance
- F&B program design and management
- Event programming

## What the HMC is NOT

- Does **NOT buy properties**
- Does **NOT own real estate**
- Does **NOT raise capital to acquire properties**
- Is **NOT a REIT, fund, or investment vehicle**

## Who owns the properties?

**Property owners** — independent investors, families, or SPVs — own the real estate. They:
1. Already own (or independently acquire) a large estate
2. Decide to convert it into a boutique hospitality property
3. **Hire the HMC** to manage and brand the property
4. Pay management fees from property revenue
5. Keep the property economics (NOI, appreciation, exit proceeds)

## What the HMC raises money for

Capital (via SAFE notes or similar) funds **management company operations**:
- Hiring the executive team
- Building the technology platform
- Marketing the brand to attract property owners
- Pre-opening support for new properties joining the brand
- Working capital until fee revenue covers costs

## The ICP — Management Company Level

The ICP defines the types of properties the HMC works with — plus or minus, not too restrictive. It serves to:
- **Size the management company** — how many properties, what scale of operations
- **Define internal and external services** — what the HMC needs to deliver
- **Shape revenue and expense models** — fee structure, staffing, overhead

The ICP is derived from the current portfolio (properties with switch ON). The Analyst should:
1. Build the ICP from the existing property mix
2. Allow the user to view the ICP used
3. Allow the user to regenerate the ICP (= ask The Analyst to redo the analysis)
4. A dedicated research engine for this task (only one HMC, run it well)

**IMPORTANT:** Basic HMC information (name, country, start date) must exist before research runs. The research endpoint checks for companyName and modelStartDate. If missing, returns COMPANY_SETUP_INCOMPLETE. The Analyst runs on whatever data exists — seed or user-entered. It validates and flags issues rather than blocking.

## Property Switches

Properties with switch ON = in agreement to use the HMC for branding and services. Part of the current scenario, visible to the assigned user, included in all financial calculations.

Switch OFF = not currently under management contract, hidden from calculations but NOT deleted.

## People Cross Entities

A single person can simultaneously be:
- Principal/executive in the management company (earns salary)
- Investor in one or more property SPVs (receives distributions)
- Both at the same time — different hats, different financial flows

The user system gives people access to both ManCo and property views based on role and assignments.

## The Financial Model

Two entities modeled:
1. **Management Company** — P&L from management fees minus operating costs
2. **Property SPVs** — each property's standalone financials

Intercompany linkage: ManCo revenue from fees = Property expense for those same fees.

## Language Rules

- NEVER say "HMC acquires properties" or "acquisition pipeline"
- SAY "properties that join the brand" or "new management contracts"
- NEVER say "investment thesis for buying properties"
- SAY "brand fit criteria" or "management client profile"
- NEVER call Norfolk AI the management company — Norfolk AI builds the app
- NEVER hardcode company names — always use the admin-configured name
- The ICP is about PROSPECTING for management clients, not ACQUIRING assets
