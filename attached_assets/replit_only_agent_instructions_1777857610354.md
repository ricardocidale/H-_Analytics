# REPLIT AGENT INSTRUCTIONS — CANONICAL SLIDE GENERATOR

These instructions are for **Replit Agent only**.

Your task is to build a slide-generation app inside this Replit project using the provided JSON design contract.

---

## 1. PROJECT GOAL

Build a React-based slide renderer that generates new slides matching the canonical deck described in:

`canonical_slide_design_and_generation_contract.json`

The JSON is the source of truth for:
- theme
- colors
- fonts
- slide layouts
- bounding boxes
- element roles
- slide structure
- validation rules

Do not create a new visual design.

Render the same design system with new user-provided data.

---

## 2. REQUIRED OUTPUT

Create a working React app that can:

1. Load the JSON design contract.
2. Render slides on a fixed 960 × 540 canvas.
3. Use absolute positioning for every visual element.
4. Replace canonical content with new property data.
5. Preserve the deck’s original look and layout.
6. Export or display the generated slides.

---

## 3. DO NOT USE APP THEMES OR DEFAULT UI

Do not use:
- Replit UI styling
- default browser styles
- generic dashboard layouts
- default card components
- auto-responsive layouts
- Bootstrap
- Material UI
- shadcn/ui
- Tailwind component presets

If Tailwind is already installed, use it only for utilities when necessary, but do not use Tailwind’s default design language.

All styling must be manually matched to the JSON.

---

## 4. FIXED CANVAS RULE

Every slide must render as:

```css
.slide {
  position: relative;
  width: 960px;
  height: 540px;
  overflow: hidden;
}
```

Do not make the slide responsive internally.

You may scale the entire slide preview for screen fit, but the internal coordinate system must remain 960 × 540.

---

## 5. ABSOLUTE POSITIONING RULE

Every element must use:

```css
position: absolute;
```

For each JSON `bbox`:

```json
"bbox": [x1, y1, x2, y2]
```

Compute:

```js
left = x1
top = y1
width = x2 - x1
height = y2 - y1
```

Apply those values directly to the rendered element.

Do not use flexbox or CSS grid to position slide elements.

---

## 6. SLIDE NUMBERING RULE

Use:
- Slide 1
- Slide 2
- Slide 3

Do not call them pages.

Use the JSON field:

```json
slide_number
```

as the canonical slide identifier.

---

## 7. PROPERTY NAME RULE

Each slide has:

```json
property_name_at_slide_title
```

When generating new slides:
- replace this text with the new property name
- keep the same position
- keep the same font
- keep the same size
- keep the same visual role

Do not move, center, redesign, or restyle the property name.

---

## 8. BACKGROUND RULES

Slides 1–4:
- background color: `#FFF9F5`
- add faint architectural grid texture

Suggested CSS:

```css
background-color: #FFF9F5;
background-image:
  linear-gradient(rgba(232, 227, 220, 0.35) 1px, transparent 1px),
  linear-gradient(90deg, rgba(232, 227, 220, 0.35) 1px, transparent 1px);
background-size: 40px 40px;
```

Slides 5–6:
- background color: `#9FBCAD`
- no grid

---

## 9. COLOR PALETTE

Only use these colors:

```txt
#257D41
#15331F
#9FBCAD
#AFC7B9
#FFF9F5
#FFFBF7
#9FB0A4
#FFFFFF
#D8D7D2
rgba(21,39,28,0.70)
```

Do not introduce new colors.

---

## 10. TYPOGRAPHY

Use these font roles:

### Editorial titles
```css
font-family: Georgia, serif;
font-style: italic;
font-weight: 700;
```

### Slide subtitles
```css
font-family: Georgia, serif;
font-style: italic;
font-weight: 400;
```

### Property names
```css
font-family: Poppins, Arial, sans-serif;
font-weight: 200;
```

### Body text
```css
font-family: Poppins, Arial, sans-serif;
font-weight: 200;
```

### Labels / section headers
```css
font-family: Poppins, Arial, sans-serif;
font-weight: 700;
```

If Poppins is not available, import it using Google Fonts or use the closest available sans-serif fallback.

---

## 11. IMAGE RULES

Images must:
- use exact JSON bounding boxes
- use `object-fit: cover`
- preserve rounded or circular crops
- include dark caption overlays when the JSON describes captions

Example:

```css
.slide-image {
  position: absolute;
  object-fit: cover;
  overflow: hidden;
}
```

Caption overlays:

```css
.caption {
  position: absolute;
  left: 0;
  bottom: 0;
  background: rgba(21,39,28,0.70);
  color: #FFFFFF;
  font-size: 6px;
  padding: 4px 6px;
}
```

---

## 12. CARD RULES

Cards must be built manually with CSS.

Canonical cream card:

```css
background: #FFFBF7;
border: 1px solid #D8D7D2;
border-radius: 12px;
```

Green header:

```css
background: #257D41;
color: #FFFFFF;
```

Sage header:

```css
background: #9FBCAD;
color: #FFFFFF;
```

Do not use imported card components.

---

## 13. SLIDE-SPECIFIC STRUCTURE

### Slide 1
Primary acquisition spotlight:
- left stacked images
- right property title card
- property specs card
- vision card
- large right rounded/circular image
- footer tagline

### Slide 2
Secondary property spotlight:
- similar structure to Slide 1
- left image stack
- right cards
- right supporting image

### Slide 3
Expansion concept:
- left hero image
- center concept/details panel
- right rationale column
- global expansion badge

### Slide 4
Pipeline:
- exactly six cards
- each card has image top and dark text panel bottom
- bottom strategic filter callout
- do not use a responsive grid

### Slide 5
Transformation plan:
- solid sage background
- left comparison table
- right outlined financial summary box

### Slide 6
Financial table:
- solid sage background
- dense two-column financial layout
- custom presentation table styling
- no spreadsheet UI component

---

## 14. TEXT OVERFLOW RULES

If text does not fit:
1. wrap text inside the original box
2. reduce font size slightly
3. reduce line height slightly

Do not:
- move the box
- resize the slide
- allow overlap
- push text outside bounds

---

## 15. FINANCIAL VALUE RULE

Never render:

```txt
######
```

If a financial value does not fit:
- reduce font size
- adjust spacing
- widen the internal text column if needed

The final output must show readable numbers.

---

## 16. VALIDATION BEFORE COMPLETION

Before finishing, check:

- all slide elements are absolutely positioned
- all bbox coordinates are respected
- no default UI components are visible
- all colors are from the approved palette
- fonts match the JSON hierarchy
- images are cropped correctly
- captions are present
- cards match the editorial deck style
- footers are present
- no `######` appears anywhere
- generated slides look like a continuation of the canonical deck

If any check fails, fix it before final output.

---

## 17. RECOMMENDED FILE STRUCTURE

Use a structure similar to:

```txt
src/
  App.jsx
  data/
    canonical_slide_design_and_generation_contract.json
  components/
    SlideRenderer.jsx
    TextElement.jsx
    ImageElement.jsx
    CardElement.jsx
  styles/
    slides.css
```

Keep the renderer simple and deterministic.

---

## 18. IMPLEMENTATION PRIORITY

Build in this order:

1. Load JSON.
2. Create fixed slide canvas.
3. Implement bbox-to-style helper.
4. Render text elements.
5. Render visual elements.
6. Add slide backgrounds.
7. Add images and captions.
8. Add card styling.
9. Add replacement data support.
10. Add validation checklist.

---

## 19. FINAL EXPECTATION

The result should look like the same Lola & Ber canonical deck, using new data.

Do not modernize it.
Do not simplify it.
Do not redesign it.

Render the JSON-defined visual system faithfully in React.
