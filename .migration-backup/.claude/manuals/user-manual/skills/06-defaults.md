# Chapter 6: Default Values and Assumptions

The platform ships with a carefully chosen set of default values that reflect typical market conditions for boutique hotel investments. These defaults serve as a starting point — you can override any of them at the global or property level to match your specific investment scenario.

## How Defaults Work

The model uses a three-tier fallback system to determine the value of any given assumption:

1. **Property-specific value** — If you have set a value for a particular property, that value is used first.
2. **Global assumption** — If no property-specific value exists, the model falls back to the global assumption set in the Company Assumptions page.
3. **Built-in default** — If neither a property-specific nor a global value has been set, the system uses its built-in default.

This layered approach lets you set portfolio-wide assumptions globally while still customizing individual properties where needed.

## Key Default Values

The following table lists the most important default values used throughout the model:

| Parameter | Default Value |
|-----------|--------------|
| Projection Period | 10 years |
| Exit Cap Rate | 8.5% |
| Tax Rate | 25% |
| Sales Commission | 5% |
| Starting Occupancy | 55% |
| Maximum Occupancy | 85% |
| ADR Growth Rate | 3% per year |
| Occupancy Ramp Step | 5% |
| Occupancy Ramp Period | 6 months |

## In-App Guidance

Every input field in the application includes a help icon (?) that explains what the field controls, how it affects downstream calculations, and — for fields governed by accounting standards — why the value is set as it is.

For fields where AI-powered market research is available, an amber badge displays the recommended range based on current market data for the property's location and segment. You can click the badge to apply the AI-recommended midpoint value.

## Automatic Market Research Refresh

When you log in, the system automatically checks whether any property's market research data is older than seven days. Stale research is refreshed in the background, ensuring that your assumptions are always informed by up-to-date market intelligence.
