# Skill: Local Economics Research

## Overview
Research local economic indicators for a specific property location. Focus on inflation rates (CPI), interest rates (SOFR, Prime, Mortgage), and general economic health.

## Key Metrics to Extract
- **inflationRate**: The annual consumer price inflation rate for the specific metropolitan area or region.
- **interestRate**: Current benchmark interest rates applicable to commercial hospitality lending in the region (e.g., SOFR + spread, local mortgage rates).

## Research Strategy
1. Query FRED (Federal Reserve Economic Data) for regional CPI and unemployment.
2. Query BLS (Bureau of Labor Statistics) for local wage growth and industry-specific inflation.
3. Analyze local economic development reports for the specific city/county.

## Output Format
```json
{
  "localEconomics": {
    "inflationRate": "3.2%",
    "interestRate": "7.5%",
    "cpiBreakdown": {
      "housing": "4.1%",
      "services": "3.5%"
    },
    "economicOutlook": "Stable growth with moderate inflation pressure.",
    "sources": ["FRED", "BLS", "Local Economic Council"]
  }
}
```
