---
name: hbg-product-vision
description: Product direction and design principles for HBG Portal. Covers product identity, core tenets, workflow principles, navigation, user roles, white-labeling, roadmap themes, and cross-skill reference map. Use when planning features or evaluating alignment.
---

Where the HBG Portal product is heading and the design principles that must govern all future work. Covers product identity, core design tenets, workflow principles, navigation architecture, user roles, white-labeling, active roadmap themes, future direction, and the cross-skill reference map. Use this skill when planning new features, making architectural decisions, or evaluating whether proposed work aligns with the product direction.

## Product Identity

> **HBG Portal is a "Bloomberg Terminal for boutique hospitality."**

Every screen, interaction, and data point should convey:
- **Precision** — numbers are exact, formulas are transparent
- **Authority** — the tool knows hospitality finance deeply
- **Professional elegance** — it belongs in an investment committee presentation
- **Trustworthiness** — verification and audit opinions build institutional confidence

## Core Design Tenets

### 1. Deterministic Integrity
Every number must be traceable to a formula, never approximated by AI. The financial engine is the sole source of truth for calculations. AI agents assist with research and narration but never compute financial values.

### 2. Transparency
Users can always see how any number was derived: formula accordions, GAAP badges, audit opinions, research sourcing.

### 3. Professional Elegance
Every screen should look like it belongs in an investment committee presentation. Swiss Modernist design language, high data density without clutter, monospaced financial figures, earth-tone warmth.

### 4. Hospitality-Native Vocabulary
Use the language of hotel operators and investors: "Properties" not "items", "ADR" not "average price", "GOP" not "gross margin".

### 5. Progressive Disclosure
Summary first, drill into detail on demand: KPI cards -> expandable sections -> full financial tables. Tooltips for contextual education. Collapsible `SectionCard` components.

## Workflow Design Principles

- **Minimize Navigation** — Bring tools to the user's context (inline research buttons, "Apply Research" overlays, formula accordions).
- **Research Informs, Not Dictates** — AI benchmarks appear as suggestions (yellow pills). Users Accept, Modify, or Ignore. Never auto-applies.
- **Verification Builds Confidence** — One-click verification, formal audit opinions (Unqualified/Qualified/Adverse), drillable check results.
- **Scenarios Are Effortless** — Save, Load, Compare side-by-side. Base case is always preserved.

## Navigation & Information Architecture

| Group | Items |
|-------|-------|
| **Home** | Dashboard, Properties, Management Company |
| **Tools** | Simulation, Property Finder, Map View |
| **Settings** | Profile, Scenarios, General Settings |
| **Footer** | Tour, Help, Admin, Sign Out |

Admin has its own sidebar: Brand, Business, Research, Design, AI Agents, System, Logs.

## User Roles

| Role | What They See | Key Capabilities |
|------|--------------|-----------------|
| **Admin** | Everything + admin panel | Full CRUD, user management, system configuration |
| **Partner** | Full investment toolkit | Edit assumptions, create scenarios, run research |
| **Checker** | Read-only + verification tools | Run verification, view audit opinions, export reports |
| **Investor** | Dashboard + filtered properties | View-only, properties filtered by user group |

## White-Labeling & Multi-Tenancy

Each user group can have custom branding (logo, theme, asset descriptions).

**Theme Resolution Cascade:**
```
User's selected theme -> Group's assigned theme -> System default (Tuscan Olive Grove)
```

## Quality Bar

Every new page or feature must follow:

| Requirement | Reference |
|------------|-----------|
| Width conventions | `consistent-card-widths` skill |
| Save button patterns | `save-button-placement` skill |
| Export patterns | `export-system` skill |
| Design system components | `design-system-export` skill |
| Visual identity | `hbg-design-philosophy` skill |
| Business vocabulary | `hbg-business-model` skill |
| Financial accuracy | `financial-engine` skill |
| Verification compatibility | `verification-system` skill |

## Cross-Skill Reference Map

```
                    product-vision
                    (this skill)
                         |
          +--------------+--------------+
          |              |              |
    business-model  design-philosophy  api-backend-contract
          |              |              |
      financial-     design-system-  integrations-
      engine         export          infrastructure
          |                              |
    verification-                   marcela-ai-
    system                          system
```

| Skill | Connects To | Relationship |
|-------|------------|-------------|
| `hbg-business-model` | `financial-engine` | Business rules -> engine contracts |
| `financial-engine` | `verification-system` | Engine output -> verification input |
| `integrations-infrastructure` | `marcela-ai-system` | AI providers -> Marcela |
| `hbg-design-philosophy` | `design-system-export` | Visual identity -> component library |
| `hbg-product-vision` | All skills | Strategic alignment |
