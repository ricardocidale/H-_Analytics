# Chapter 5: Property Lifecycle

Every property in the portfolio moves through a four-phase lifecycle: acquisition, operations, refinancing, and exit. Understanding these phases is essential for interpreting the financial projections and evaluating the timing of cash flows.

## Phase 1: Acquisition

The lifecycle begins when a property is purchased. The acquisition phase establishes the property's cost basis and initial capital structure.

The purchase price is set individually for each property. Closing costs are calculated at 2% of the purchase price, covering legal fees, title insurance, inspections, and other transaction expenses. For financed properties, the acquisition loan is sized at 75% of the purchase price, with the remaining 25% funded by equity. Full-equity properties carry no debt — the entire purchase price is covered by cash investment.

## Phase 2: Operations

Once the acquisition is funded, the property enters its operating phase. Revenue begins on the designated operations start date and grows over time as the property ramps up to stabilized performance.

Occupancy grows using a discrete step-up model. Two settings control this: the **Occupancy Ramp** (the number of months between each step-up) and the **Occupancy Growth Step** (how many percentage points occupancy jumps at each step). For example, a property starting at 40% occupancy with a 9-month ramp interval and a 5% growth step will sit at 40% for the first 9 months, then jump to 45%, hold there for another 9 months, jump to 50%, and so on until hitting its stabilized maximum. This staircase pattern reflects the real-world trajectory of a newly acquired boutique hotel as it builds market awareness and guest loyalty in waves — not smoothly, but in observable step changes as seasonal cycles, marketing campaigns, and reputation milestones accumulate.

The average daily rate (ADR) grows at a configurable annual rate, compounding each year. All operating expenses are calculated as percentages of revenue following the USALI departmental structure, which is the industry standard for hotel financial reporting.

## Phase 3: Refinancing (Optional)

At a configurable point during the hold period — by default, three years after operations begin — the property may be refinanced. Refinancing replaces the original acquisition loan with a new loan based on the property's current appraised value.

The new loan is sized at 65% of the appraised value, with closing costs of 3%. The original loan is paid off in full. If the new loan amount exceeds the payoff of the old loan plus refinancing costs, the excess proceeds are distributed to investors. This mechanism allows investors to recapture a portion of their equity while the property continues to operate.

## Phase 4: Exit

At the end of the projection period, the property is sold. The exit phase converts the property's value into cash and distributes the proceeds to investors.

The exit value is determined by dividing the final year's Net Operating Income by the exit cap rate (default 8.5%). A sales commission of 5% is deducted from the gross sale price. All outstanding debt is repaid from the proceeds. The remaining net proceeds are distributed to investors, completing the investment cycle.
