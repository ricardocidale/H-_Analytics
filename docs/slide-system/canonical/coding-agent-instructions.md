# 🔒 CANONICAL SLIDE GENERATION — CODING AGENT INSTRUCTIONS (REPLIT)

You are a **coding agent** responsible for generating slides using code.

## CORE PRINCIPLE
You are not designing slides.
You are:
**Rendering a fixed visual system using new data.**

---

## 1. SOURCE OF TRUTH
Use ONLY the provided JSON file.

You MUST use:
- design_theme
- slides[]
- generation_contract
- bbox / layout fields

You MUST NOT use:
- App UI themes
- Tailwind / Bootstrap / Material UI defaults
- Component libraries
- Responsive layouts

---

## 2. RENDERING MODEL (MANDATORY)

All slides MUST use absolute positioning.

Container:
```
position: relative;
width: 960px;
height: 540px;
```

Elements:
```
position: absolute;
left: x;
top: y;
width: w;
height: h;
```

Derived from:
bbox = [x1, y1, x2, y2]

```
left = x1
top = y1
width = x2 - x1
height = y2 - y1
```

---

## 3. SLIDE RULE
Use:
Slide 1, Slide 2, etc.

Never use page terminology.

---

## 4. PROPERTY TITLE RULE
Replace:
property_name_at_slide_title

Keep:
- same position
- same font
- same size

Do NOT restyle or move.

---

## 5. BACKGROUNDS

Slides 1–4:
- #FFF9F5
- faint grid texture

Slides 5–6:
- #9FBCAD
- no grid

---

## 6. COLORS (STRICT)

Only use:
#257D41
#15331F
#9FBCAD
#AFC7B9
#FFF9F5
#FFFBF7
#9FB0A4
#FFFFFF
rgba(21,39,28,0.70)

---

## 7. TYPOGRAPHY

Titles:
Georgia Bold Italic / Italic

Body:
Poppins ExtraLight

Property Name:
Poppins ExtraLight (large)

Captions:
small white text over dark overlay

---

## 8. IMAGES

- object-fit: cover
- rounded or circular
- include caption overlay

---

## 9. CARDS

Manual CSS only:

```
background: #FFFBF7;
border: 1px solid #D8D7D2;
border-radius: 12px;
```

No UI components allowed.

---

## 10. SLIDE TYPES

Slide 1–2: property spotlight  
Slide 3: expansion concept  
Slide 4: 6-card pipeline  
Slide 5: transformation + metrics  
Slide 6: financial table  

---

## 11. OVERFLOW RULE

- wrap text
- reduce font size slightly

Never break layout.

---

## 12. FINANCIAL RULE

Never output:
######

Fix layout instead.

---

## 13. FOOTER

Must include:
- left icon + tagline
- right dots or number

---

## 14. FINAL CHECK

- absolute positioning used
- bbox respected
- no UI components
- colors correct
- fonts correct
- no ######
- layout matches canonical

---

## OUTPUT

Generate:
HTML + CSS (or React)

Pixel-accurate to JSON.

---

## 15. CANONICAL PNG COMPARISON (MANDATORY)

Before completing any slide generation or modification task, compare the rendered output against the canonical PNG for each slide you changed.

### Source files

```
attached_assets/L+B_Property_6-Slide_Cannonical_Page_1_1777868023135.png  → Slide 1
attached_assets/L+B_Property_6-Slide_Cannonical_Page_2_1777868023137.png  → Slide 2
attached_assets/L+B_Property_6-Slide_Cannonical_Page_3_1777868023137.png  → Slide 3
attached_assets/L+B_Property_6-Slide_Cannonical_Page_4_1777868023136.png  → Slide 4
attached_assets/L+B_Property_6-Slide_Cannonical_Page_5_1777868023136.png  → Slide 5
attached_assets/L+B_Property_6-Slide_Cannonical_Page_6_1777868023136.png  → Slide 6
```

These are also in R2: `canonical/lb-6-slide/slides/slide-{1..6}.png`

### Comparison checklist

For every slide you generated or modified:

1. Layout positions match (±2px tolerance against bbox values)
2. Colors match exactly — PALETTE tokens only
3. Typography: font family, weight, size, capitalization
4. Dynamic slots filled; static chrome verbatim from spec
5. Photos: object-fit cover, clip radius, caption overlay
6. Background: `#FFF9F5` grid for slides 1–4, `#9FBCAD` solid for slides 5–6
7. Footer: left icon + tagline, right dots or page number

### Generation workflow (revised)

```
Step 0: Load canonical PNG for target slide(s)
Step 1: Read spec_skeleton_v4.json for that slide's elements
Step 2: Render using contract.ts values (bb(), PALETTE, FONTS)
Step 3: Compare output against canonical PNG using checklist above
Step 4: Fix any discrepancies before delivering
Step 5: Never output ######
```

If a discrepancy exists between the JSON spec and the canonical PNG, the PNG wins.
