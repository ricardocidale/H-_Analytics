# Chapter 10: Scenario Management

Scenario Management allows users to save, load, compare, and restore complete snapshots of the financial model's assumptions and property configurations. It is accessible via the My Scenarios section in the sidebar navigation and is an essential tool for both model exploration and systematic verification testing.

---

## What Is a Scenario?

A scenario is a named snapshot that captures the entire state of the financial model at a point in time. This includes all global assumptions (inflation, fee rates, debt terms, staffing, SAFE funding, and more), all property configurations (room count, ADR, occupancy, cost rates, financing terms, and more), and the portfolio composition (which properties exist and their parameters).

Scenarios enable side-by-side comparison of different investment strategies without losing prior work, making them invaluable for both business analysis and verification testing.

---

## Scenario Operations

The platform supports eight operations on scenarios:

| Operation | Description | Effect |
|-----------|-------------|--------|
| **Save** | Captures the current state of all global assumptions and property configurations as a named snapshot | Creates a new scenario record with a timestamp; does not modify the current working state |
| **Load** | Restores a previously saved scenario | Replaces all current assumptions and property configurations with the saved snapshot values |
| **Update** | Rename or change the description of an existing scenario | Metadata change only — does not alter the saved assumption data |
| **Delete** | Permanently remove a saved scenario | Irreversible — the scenario and all its saved data are deleted |
| **Export** | Download a scenario as a JSON file | Creates a portable backup that can be imported elsewhere |
| **Import** | Upload a previously exported JSON scenario | Creates a new scenario from the imported file |
| **Clone** | Duplicate an existing scenario with a new name | Creates an exact copy with a "(Copy)" suffix |
| **Compare** | Side-by-side diff of two scenarios | Shows which assumptions and properties differ between the two snapshots |

---

## Save Behavior

When saving a scenario, the system captures global assumptions (model start date, projection years, inflation rate, management fee rates, debt assumptions, staffing tiers, partner compensation, SAFE funding terms), property configurations (per-property room count, ADR, growth rates, occupancy targets, ramp-up period, purchase price, improvements, cost rates, financing terms, refinance settings), portfolio composition (which properties are included and their operating parameters), and metadata (scenario name, description, creation timestamp, last modified date).

It is important to understand that scenarios capture a complete point-in-time snapshot. Loading a scenario replaces all current working data — the previous working state is lost unless it was saved as its own scenario first.

---

## Use Cases

Scenarios support several common workflows. To compare investment strategies, save a "Base Case" scenario, modify assumptions, save as "Aggressive Growth," and use Compare to see differences. For sensitivity testing, save the current state as a baseline, adjust one variable (such as the ADR growth rate), observe the impact, then reload the baseline. Before any experimentation, always save the current state as "Baseline" or "Original" to preserve it. For client presentations, save scenarios representing different options (Conservative, Moderate, Aggressive) for investor review. For version history, save periodically during model building to create a traceable history of assumption evolution.

---

## Scenario Comparison

The Compare feature produces a structured diff between two saved scenarios, showing assumption differences (each global assumption that differs, with the value in each scenario), property changes (properties that were added, removed, or modified between scenarios), and per-property field diffs (for modified properties, each field that changed with both values).

---

## Checker Guidelines for Scenario Management

### Before Testing

Always save a baseline scenario before beginning any verification session. Name it clearly (for example, "Checker Baseline — 2026-02-09") and include a description noting the purpose ("Pre-verification snapshot of production assumptions").

### During Testing

Create test scenarios for specific verification tasks. Examples include a "Zero Occupancy Test" (set all occupancies to 0 to verify expense floors), a "Max Leverage Test" (set LTV to maximum to verify equity constraints), a "No Refinance Test" (disable all refinancing to verify base case debt service), and a "Single Property Test" (remove all but one property to verify isolation). After each test, reload the baseline before starting the next test.

### After Testing

Clean up test scenarios by deleting temporary test snapshots. Verify the baseline scenario still loads correctly. Confirm that loading a scenario fully replaces all assumptions with no stale data remaining.

### Verification Checklist

| Check | Description |
|-------|-------------|
| ☐ | Save creates a new scenario with correct timestamp |
| ☐ | Load replaces all global assumptions (verify several fields) |
| ☐ | Load replaces all property configurations (verify several fields) |
| ☐ | Load replaces portfolio composition (correct property count) |
| ☐ | Update changes name/description without altering saved data |
| ☐ | Delete permanently removes the scenario |
| ☐ | Export downloads a valid JSON file |
| ☐ | Import creates a scenario from uploaded JSON |
| ☐ | Clone creates an exact copy with modified name |
| ☐ | Compare correctly identifies assumption differences |
| ☐ | Compare correctly identifies property additions, removals, and changes |
| ☐ | Loading scenario A then scenario B yields different financial outputs |
| ☐ | Saving then immediately loading returns identical assumptions |
