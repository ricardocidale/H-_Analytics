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
