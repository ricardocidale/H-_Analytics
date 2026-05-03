# 🔍 SELF-VALIDATION SYSTEM (AGENT CHECKLIST)

You MUST run this validation AFTER generating slides and BEFORE final output.

---

## 1. LAYOUT VALIDATION

- All elements use `position: absolute`
- All elements respect bbox coordinates
- No flexbox or grid auto-layouts used

FAIL → regenerate layout using absolute positioning

---

## 2. SLIDE STRUCTURE

- Slide labeled as Slide 1–6 (not page)
- Correct layout used for slide type
- Required elements present:
  - property title
  - images
  - cards
  - footer

FAIL → rebuild slide using correct template

---

## 3. COLOR VALIDATION

Only allowed colors:

#257D41  
#15331F  
#9FBCAD  
#AFC7B9  
#FFF9F5  
#FFFBF7  
#9FB0A4  
#FFFFFF  
rgba(21,39,28,0.70)

FAIL → replace all invalid colors

---

## 4. TYPOGRAPHY VALIDATION

- Titles use Georgia (italic/bold)
- Body uses Poppins ExtraLight
- Property name uses large Poppins ExtraLight
- No default system fonts

FAIL → fix fonts and hierarchy

---

## 5. IMAGE VALIDATION

- Images use object-fit: cover
- Images respect bbox
- Rounded/circular cropping applied
- Caption overlay present

FAIL → fix image styling

---

## 6. CARD SYSTEM VALIDATION

- Cards use manual CSS (not UI components)
- Cream background (#FFFBF7)
- Thin border (#D8D7D2)
- Rounded corners

FAIL → rebuild cards manually

---

## 7. FINANCIAL VALIDATION (CRITICAL)

- No ###### values
- All numbers readable

FAIL → resize text or layout until readable

---

## 8. FOOTER VALIDATION

- Left: icon + tagline
- Right: slide indicator

FAIL → add missing footer

---

## 9. FORBIDDEN ELEMENT CHECK

Ensure NONE of these exist:

- Tailwind UI components
- Material UI
- Bootstrap components
- Flexbox auto layouts
- Grid auto layouts

FAIL → remove and rebuild manually

---

## 10. FINAL VISUAL CHECK

Ask:

"Does this look like the SAME deck?"

If not:
→ fix until it does

---

## EXECUTION LOOP

Generate → Validate → Fix → Validate → Output
