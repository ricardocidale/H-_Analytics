---
name: Product Direction & Admin Redesign
description: The product roadmap, admin section architecture, user simplification, and how every feature serves the fundraising mission.
---

# Product Direction

## The App Is a Fundraising Intelligence Platform
- NOT an operating system, NOT a spreadsheet
- The AI research engines ARE the product — they supply the judgment a human analyst would need years of experience to have
- Every output is viewed through the lens: "will a sophisticated investor believe this?"
- Cost per run is NOT a concern. Accuracy and elegance ARE.

## Admin Section — 10 Functional Blocks

### Block 1: Management Company Admin
- Services provided to properties (defaults, mandatory: Marketing & Brand + Performance Fee)
- Cost categories as % of revenue, research-suggested
- Financial statement line items FIXED — admin influences via percentages only
- Research regenerate button for sizing numbers
- Default seed values in organized sub-tabs

### Block 2: Properties Admin
- Two sub-sections: Hotel model + Luxury rental model
- Admin sets required fields per property (ON/OFF switches) for research engine input
- Fixed financial statement structure with accordion lines
- Defaults are placeholders — replaced on first research run
- Minimum property descriptors: address, rooms, quality tier, property size, F&B capacity

### Block 3: AI Research Engines (CRITICAL)
- Source cards: APIs (must work or switch OFF), URLs, RAG files, admin text
- All seeded during development
- Admin tests via buttons; app manages timeouts for critical sources
- If engines can't determine a range → say so (don't guess)
- Entity-aware: ManCo vs Hotel vs Luxury Rental

### Block 4: Users (SIMPLIFIED)
- ELIMINATE: user_groups, user_group_properties, user-company associations
- User record: email, role, company (free text), name, preferences
- ~49 files impacted by group removal

### Block 5: Scenarios
- Admin sees all scenarios (default + per-user)
- Admin assigns default scenario per user via ON/OFF property toggles
- Properties NEVER deleted — only toggled ON/OFF per user
- Chevron-expandable property list per user in admin
- Auto-save after 1hr idle → visible versioned copy "Name (1)", "Name (2)"

### Block 6: Rebecca (AI Chatbot)
- Name is REBECCA (confirmed)
- RAG + pgvector + current screen/page context awareness
- Must be delightful, well-spoken, knowledgeable about app + business + research

### Block 7: Themes
- Palettes, icons — seeded during development, admin editable
- Users select theme from cards in My Profile

### Block 8: App-Wide Variables & Defaults
- Catch-all for settings not in other sections

### Block 9: Testing & Verification
- Golden scenarios with known-correct outputs, locked in DB
- Based on real properties + edge cases
- If golden scenario can't be reproduced = SERIOUS problem
- Verification retention: 1+ year (currently 7 days — must fix)

### Block 10: Reports & Exports
- Investor-ready: PDF, PPTX, DOCX (branded, charts, narrative)
- Data exports: XLSX, CSV (raw numbers)
- Per management company, per property, per portfolio

## Research UX — "Press a Button"
- Users click regenerate button on any assumption page
- Research improves iteratively as user adds more property details
- Engines produce ranges: { low, mid, high, rationale, sources, confidence }
- Range badges displayed alongside each variable
- Most users read tooltip and accept suggested value

## Quality Tier (Not Stars)
Use STR chain scale naming: Luxury, Upper Upscale, Upscale, Upper Midscale, Midscale, Economy
Reflects service level + location + uniqueness — not just amenity checklists.
Required field on every property. Drives ADR expectations and comp set selection.

## Properties Are Permanent
- Never deleted from app
- Can be toggled ON/OFF per scenario and per user default
- Admin manages master property list
