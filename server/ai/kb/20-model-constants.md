Governed Model Constants

## What they are

A small, distinct category of values that are not user assumptions and not free-form inputs. They are accounting and regulatory standards that apply to everyone — GAAP, IRS, USALI — and the portal centrally governs them so every calculation, every export, every audit uses the same number.

There are two layers in the portal:

- **Investor assumptions** — what an investor believes about a market or property (occupancy, ADR, growth rates, fees). These live on the property and on Company Assumptions and follow the per-property → systemwide → constant cascade.
- **Governed Model Constants** — accounting and regulatory standards (Days per Month, Depreciation Years). These live in Admin → Model Defaults → Model Constants. They are not editable from property pages or from Company Assumptions.

Today the registered Model Constants are:

- **Days per Month** — 30.5, universal industry convention (365 ÷ 12). Used everywhere occupied room-nights are converted between monthly and annualized rates.
- **Depreciation Years** — country-specific. 39 years for US hotels under IRC §168(e)(2)(A) MACRS; 20 years in Colombia and Mexico; 25 years in Brazil; etc. See the country defaults table for the full citation list.

## Three-state badge

Every governed constant shows a badge in the admin UI describing where its current effective value comes from:

- **Factory** — the built-in default from the shared constants file. The starting point if nothing else has been set.
- **Analyst** — a value researched and proposed by The Analyst, with a citation captured in the audit trail. Confirmed by an admin via the Regenerate dialog.
- **Manual** — an admin typed the value in directly. Highest precedence; overrides both Analyst and Factory.

Resolution precedence is: Manual override > Analyst override > Factory value, evaluated per-locality (universal, country, or country+state) where applicable.

## Regenerate Research and Intelligence

The sparkle button on each row opens the Analyst regeneration dialog. The Analyst (Perplexity/Tavily research → Claude Sonnet 4.5 reasoning) produces a typed proposal: the new value, the reasoning, and a list of grounded web sources. The admin reviews and confirms before anything is persisted. If the Analyst confirms the current value is correct, no change is saved.

## Why the Tax and Macro sections are read-only

Depreciation Years used to live as an editable field on the Tax section, and Days per Month as a slider on the Macro tab. They were moved to Model Constants because they are governance items, not investor knobs — different users editing them on different properties would have produced inconsistent financials. The Tax section now displays the governed value with a link back to Admin → Model Constants. Capital Structure and similar fields that *do* legitimately vary per property remain editable on the property as before.

## How the values reach the engine

The admin's confirmed value is overlaid onto the global assumptions object on the server, at every engine boundary — finance routes (portfolio, single property, company), scenario create/recompute/compare, exports, sensitivity analysis, and the verification audit. The server is authoritative: even if a client sends a stale Days per Month in its request payload, the engine substitutes the admin-governed value before computing. Users do not need to reload the page after an admin changes a constant; the next calculation will use the new number.
