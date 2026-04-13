---
name: tool-schemas
description: Tool schema organization and conventions for analysis, financing, research, validation, and property-finder tools. Use when creating new tools or understanding the tool system.
---

# Tool Schema System

## Overview
Tool schemas are JSON files defining structured inputs/outputs for AI-assisted workflows. They live in two locations organized by domain.

## Directory Structure

### `.claude/tools/` — Non-research tools
```
.claude/tools/
├── analysis/          # Statement consolidation, scenario comparison, break-even
├── financing/         # DSCR, debt yield, prepayment, sensitivity, loan comparison, FSA
├── returns/           # DCF/NPV, IRR cash flow vector, equity multiple, exit valuation
├── ui/                # Theme management, property comparison, what-if, variance
└── validation/        # Financial identities, funding gates, debt reconciliation, assumptions, exports
```

### `.claude/skills/research/*/tools/` — Research tools (co-located)
```
research/market-overview/tools/     → analyze_market
research/adr-analysis/tools/        → analyze_adr
research/occupancy-analysis/tools/  → analyze_occupancy
research/event-demand/tools/        → analyze_event_demand
research/cap-rate-analysis/tools/   → analyze_cap_rates
research/competitive-set/tools/     → analyze_competitive_set
research/land-value/tools/          → analyze_land_value
```

### `.claude/skills/property-finder/tools/` — Property finder tools
```
property-finder/tools/
├── validate-listing-url.json    → validate_listing_url
├── search-properties.json       → search_properties (RapidAPI)
└── manage-favorites.json        → manage_favorites
```

## Schema Conventions
- Each tool is a single `.json` file
- File name matches the tool function name (snake_case)
- Schema includes: name, description, parameters (JSON Schema), required fields
- Research tools are co-located with their parent skill for discoverability

## Finance Standards Authority
The master reference tool is `.claude/tools/financing/financial_standards_authority.json`.
For any finance/stats/consolidation/refi work, consult this tool output before implementing classification-sensitive logic.

## Adding a New Tool
1. Determine category (analysis, financing, returns, validation, research, property-finder)
2. Create JSON schema file in the appropriate directory
3. Define name, description, parameters with types and descriptions
4. Add to the parent SKILL.md if co-located with a skill
5. Reference in claude.md if it's a primary workflow tool
