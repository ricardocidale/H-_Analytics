# L+B Hospitality Dashboard Design Style Guide

**Design Philosophy: Swiss Modernist Data Visualization**

This guide defines the design system for the L+B Hospitality financial analytics dashboard. The approach prioritizes absolute clarity, mathematical precision, and functional elegance inspired by Swiss Modernist design principles. This system ensures financial data is immediately comprehensible while maintaining professional sophistication.

---

## Design Principles

The design system is built on four foundational principles that guide every visual and structural decision:

**Data-First Philosophy**: Information density is maximized without sacrificing clarity. Every visual element serves the purpose of revealing financial insights. Decorative elements are eliminated in favor of functional design that communicates meaning through position, proportion, and typography.

**Mathematical Precision**: All spacing, sizing, and layout decisions follow systematic rules based on an 8-pixel grid system. This creates visual harmony and predictability across the interface. Asymmetric layouts are preferred over centered compositions to create dynamic tension while maintaining balance.

**Functional Hierarchy**: Visual weight is distributed according to information importance. Primary metrics use larger type and prominent positioning, while supporting data uses smaller scales and subdued treatment. Hierarchy is achieved through size, weight, and spatial relationships rather than decorative elements.

**Restrained Motion**: Animations serve information revelation, not decoration. Transitions are swift (200ms) and purposeful, revealing context or confirming actions. Motion never distracts from data comprehension.

---

## Typography System

Typography is the primary tool for creating hierarchy and ensuring readability across dense financial data. The system uses three carefully selected typefaces, each serving a specific purpose.

### Font Families

**IBM Plex Sans (Display & Headers)**
- **Usage**: Page titles, section headers, card titles, navigation labels
- **Weights**: 600 (Semi-Bold) only
- **Characteristics**: Geometric precision with humanist warmth, excellent at large sizes
- **Implementation**: `font-family: 'IBM Plex Sans', sans-serif; font-weight: 600;`

**Inter (Body & Labels)**
- **Usage**: Body text, form labels, descriptions, button text, table headers
- **Weights**: 400 (Regular), 500 (Medium)
- **Characteristics**: Optimized for screen readability, neutral and professional
- **Implementation**: `font-family: 'Inter', sans-serif;`

**JetBrains Mono (Numerical Data)**
- **Usage**: All financial figures, percentages, currency values, dates, numerical tables
- **Weights**: 400 (Regular), 600 (Semi-Bold)
- **Characteristics**: Monospaced for perfect vertical alignment in tables and charts
- **Implementation**: `font-family: 'JetBrains Mono', monospace;`

### Typography Scale

The type scale follows a modular progression that creates clear hierarchy while maintaining readability:

| Element | Font Family | Size | Weight | Line Height | Letter Spacing |
|---------|-------------|------|--------|-------------|----------------|
| Page Title | IBM Plex Sans | 30px | 600 | 1.2 | -0.02em |
| Section Header | IBM Plex Sans | 24px | 600 | 1.3 | -0.01em |
| Card Title | IBM Plex Sans | 18px | 600 | 1.4 | 0 |
| Subsection Header | IBM Plex Sans | 16px | 600 | 1.4 | 0 |
| Body Text | Inter | 14px | 400 | 1.5 | 0 |
| Label Text | Inter | 13px | 500 | 1.4 | 0 |
| Small Text | Inter | 12px | 400 | 1.4 | 0 |
| Large Metric | JetBrains Mono | 32px | 600 | 1.2 | 0 |
| Medium Metric | JetBrains Mono | 20px | 600 | 1.3 | 0 |
| Table Number | JetBrains Mono | 14px | 400 | 1.5 | 0 |
| Small Number | JetBrains Mono | 12px | 400 | 1.4 | 0 |

### Typography Rules

**Numerical Alignment**: All numerical data must use JetBrains Mono to ensure perfect vertical alignment in tables and consistent character width across different values. This is critical for financial data where users scan columns of numbers.

**Header Hierarchy**: Page titles use IBM Plex Sans at 30px, section headers at 24px, and card titles at 18px. This 6-8px reduction between levels creates clear hierarchy without excessive size differences.

**Body Text Consistency**: All descriptive text, labels, and explanatory content uses Inter at 14px for body text and 13px for labels. This maintains readability while distinguishing between content types.

**Letter Spacing Adjustments**: Large display text (30px+) uses negative letter spacing (-0.02em) to maintain optical balance. Body text and smaller sizes use default spacing (0) for optimal readability.

---

## Layout & Grid System

The layout system creates structure and predictability through systematic spacing and asymmetric composition. All measurements align to an 8-pixel base grid.

### Spacing System

The spacing scale uses multiples of 8 pixels to create consistent rhythm throughout the interface:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, tight inline spacing |
| sm | 8px | Element padding, small gaps |
| md | 16px | Card padding, section gaps |
| lg | 24px | Large section spacing |
| xl | 32px | Page margins, major section breaks |
| 2xl | 48px | Hero spacing, major divisions |
| 3xl | 64px | Maximum spacing for emphasis |

### Layout Principles

**Asymmetric Grid**: Avoid centered layouts. Use offset grids where content is weighted to one side, creating visual interest while maintaining balance. The sidebar occupies 180px on the left, leaving the main content area to flow naturally.

**Generous Whitespace**: Space is an active design element. Use 32px minimum padding within cards, 24px between major sections, and 16px between related elements. Whitespace reduces cognitive load and improves scanability.

**Consistent Card Structure**: All data cards follow the same internal structure with 32px padding, 24px gaps between sections, and 16px gaps between related items. Cards use single-pixel borders and subtle shadows for depth.

**Responsive Breakpoints**: The layout adapts at three key breakpoints:
- Mobile: < 640px (single column, stacked cards)
- Tablet: 640px - 1024px (two-column grid)
- Desktop: > 1024px (full multi-column layout with sidebar)

### Sidebar Navigation

The sidebar provides persistent navigation with a narrow 180px width to maximize content space:

- **Width**: 180px fixed
- **Padding**: 16px horizontal, 24px vertical
- **Item Height**: 40px with 8px gaps
- **Active State**: Subtle background change with 4px left border accent
- **Typography**: Inter 14px Medium for labels

---

## Component Patterns

Components follow consistent patterns that ensure predictability and reduce cognitive load. Each component type has specific rules for spacing, typography, and interaction.

### Metric Cards

Metric cards display key performance indicators with emphasis on the numerical value:

**Structure**:
- Card padding: 32px
- Metric value: JetBrains Mono 32px Semi-Bold
- Label: Inter 13px Medium
- Subtext: Inter 12px Regular
- Gap between elements: 8px

**Layout**: Label appears above the metric value, with optional subtext (percentage change, comparison) below. Icons appear to the left of labels when used.

### Data Tables

Tables present financial data with perfect alignment and clear hierarchy:

**Header Row**:
- Typography: Inter 12px Medium
- Text transform: Uppercase
- Letter spacing: 0.05em
- Padding: 12px vertical, 16px horizontal
- Border: 1px bottom border

**Data Rows**:
- Typography: JetBrains Mono 14px Regular for numbers, Inter 14px Regular for text
- Padding: 16px vertical, 16px horizontal
- Border: 1px bottom border on all rows except last
- Hover state: Subtle background change with 200ms transition

**Expandable Rows**:
- Chevron icon (16px) appears on the left of expandable categories
- Expanded content indents 24px from parent
- Smooth height transition (200ms ease)
- Sub-rows use 14px vertical padding

**Numerical Alignment**: All currency values, percentages, and numerical data must align vertically using JetBrains Mono. Right-align numerical columns for easier scanning.

### Charts & Visualizations

Financial charts emphasize clarity and functional color coding:

**Line Charts**:
- Line width: 2px
- Point size: 4px (visible on hover)
- Grid lines: 1px, subtle
- Axis labels: Inter 12px Regular
- Legend: Inter 13px Medium with 8px color indicator

**Chart Margins**:
- Top: 24px
- Right: 32px
- Bottom: 48px (for x-axis labels)
- Left: 64px (for y-axis labels)

**Tooltips**:
- Background: Card background with border
- Padding: 12px
- Typography: Inter 13px Regular
- Shadow: Subtle elevation

### Form Controls

Form elements maintain consistency with the overall design system:

**Input Fields**:
- Height: 40px
- Padding: 12px horizontal
- Border: 1px solid border color
- Border radius: 8px
- Typography: Inter 14px Regular
- Focus state: 2px border with accent color

**Sliders**:
- Track height: 4px
- Thumb size: 16px
- Range indicators: Inter 12px Regular at track ends
- Value display: JetBrains Mono 14px Semi-Bold above slider

**Buttons**:
- Height: 40px (default), 36px (small)
- Padding: 16px horizontal
- Border radius: 8px
- Typography: Inter 14px Medium
- Icon size: 16px with 8px gap from text
- Transition: All properties 150ms ease

### Dialog Modals

Dialogs present detailed information or complex forms:

**Structure**:
- Max width: 768px (standard), 1024px (wide)
- Padding: 32px
- Border radius: 12px
- Shadow: Prominent elevation

**Header**:
- Title: IBM Plex Sans 24px Semi-Bold
- Subtitle: Inter 14px Regular
- Gap: 8px

**Content**:
- Section gaps: 24px
- Form element gaps: 16px
- Tab navigation: 40px height with 16px horizontal padding

**Footer**:
- Border top: 1px
- Padding top: 24px
- Button gap: 12px
- Right-aligned button group

---

## Visual Hierarchy & Emphasis

Hierarchy is established through size, weight, position, and spacing rather than decorative elements.

### Emphasis Techniques

**Size Differentiation**: Primary information uses larger type sizes (24px-32px), secondary information uses medium sizes (14px-18px), and tertiary information uses small sizes (12px-13px).

**Weight Variation**: Use Semi-Bold (600) for emphasis and Regular (400) for body content. Avoid using more than two weights within a single component.

**Spatial Positioning**: Place important information in the top-left quadrant where eye tracking studies show users look first. Use the F-pattern for dense information layouts.

**Grouping & Proximity**: Related elements are grouped with 8-16px gaps, while unrelated elements are separated by 24-32px gaps. This creates clear visual relationships without explicit dividers.

### Status Indicators

Status information uses subtle visual cues:

**Badges**: 
- Height: 24px
- Padding: 6px horizontal
- Border radius: 12px (pill shape)
- Typography: Inter 12px Medium
- Background: Subtle tint of semantic color

**Icons**:
- Size: 16px (inline), 20px (standalone), 24px (prominent)
- Stroke width: 2px
- Alignment: Vertically centered with adjacent text

---

## Interaction & Motion

Interactions provide feedback and reveal context without distracting from data comprehension.

### Transition Timing

All transitions use consistent timing to create a cohesive feel:

| Action | Duration | Easing |
|--------|----------|--------|
| Hover state | 150ms | ease |
| Button press | 100ms | ease-out |
| Expandable content | 200ms | ease-in-out |
| Dialog open/close | 200ms | ease-in-out |
| Tooltip appear | 150ms | ease |
| Page transition | 300ms | ease-in-out |

### Hover States

Hover states provide subtle feedback:

- **Buttons**: Background lightens/darkens slightly
- **Table rows**: Background tint with 150ms transition
- **Cards**: Subtle shadow increase (optional)
- **Links**: Underline appears with 150ms transition
- **Icons**: Opacity change or subtle scale (1.05x)

### Focus States

Focus states ensure keyboard accessibility:

- **Outline**: 2px solid accent color
- **Offset**: 2px from element edge
- **Border radius**: Matches element border radius
- **Visibility**: Always visible, never removed

---

## Responsive Design

The interface adapts to different screen sizes while maintaining design integrity.

### Breakpoint Strategy

**Mobile (< 640px)**:
- Single column layout
- Sidebar converts to bottom navigation or hamburger menu
- Cards stack vertically with full width
- Tables scroll horizontally or convert to card layout
- Font sizes reduce by 10-15% for space efficiency

**Tablet (640px - 1024px)**:
- Two-column grid for cards
- Sidebar remains visible or converts to collapsible drawer
- Tables remain full width with horizontal scroll if needed
- Font sizes at full scale

**Desktop (> 1024px)**:
- Full multi-column layout
- Fixed sidebar at 180px
- Maximum content width: 1280px centered
- Optimal line length for readability (60-80 characters)

### Adaptive Components

**Navigation**: Sidebar on desktop, collapsible drawer on tablet, bottom bar on mobile

**Tables**: Full width on desktop/tablet, horizontal scroll or card conversion on mobile

**Charts**: Maintain aspect ratio, reduce margins on smaller screens, simplify tooltips on touch devices

**Dialogs**: Full width with 16px margins on mobile, centered with max-width on desktop

---

## Accessibility Standards

The design system ensures usability for all users regardless of ability.

### Typography Accessibility

**Minimum Sizes**: Body text never smaller than 14px, labels never smaller than 12px. These sizes ensure readability for users with visual impairments.

**Line Height**: Minimum 1.4 for body text, 1.5 for dense content. Adequate line height improves readability for dyslexic users and reduces eye strain.

**Line Length**: Maximum 80 characters per line for body text. Longer lines reduce comprehension and increase reading fatigue.

### Interaction Accessibility

**Touch Targets**: Minimum 40px height for all interactive elements. This ensures usability on touch devices and for users with motor impairments.

**Keyboard Navigation**: All interactive elements must be reachable via keyboard. Tab order follows logical reading order (top-to-bottom, left-to-right).

**Focus Indicators**: Always visible 2px outline on focused elements. Never remove focus indicators as they are critical for keyboard users.

### Semantic Structure

**Heading Hierarchy**: Use proper heading levels (h1, h2, h3) in order. Never skip levels for visual styling.

**ARIA Labels**: Provide descriptive labels for icons, buttons, and interactive elements that lack visible text.

**Table Structure**: Use proper table markup with thead, tbody, th, and td elements. Include scope attributes for complex tables.

---

## Implementation Guidelines

### CSS Custom Properties

Define typography as CSS custom properties for consistency:

```css
:root {
  /* Font Families */
  --font-display: 'IBM Plex Sans', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  /* Font Sizes */
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.8125rem;  /* 13px */
  --text-base: 0.875rem; /* 14px */
  --text-lg: 1rem;       /* 16px */
  --text-xl: 1.125rem;   /* 18px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 1.875rem;  /* 30px */
  --text-4xl: 2rem;      /* 32px */
  
  /* Spacing Scale */
  --space-xs: 0.25rem;   /* 4px */
  --space-sm: 0.5rem;    /* 8px */
  --space-md: 1rem;      /* 16px */
  --space-lg: 1.5rem;    /* 24px */
  --space-xl: 2rem;      /* 32px */
  --space-2xl: 3rem;     /* 48px */
  --space-3xl: 4rem;     /* 64px */
  
  /* Border Radius */
  --radius-sm: 0.375rem; /* 6px */
  --radius-md: 0.5rem;   /* 8px */
  --radius-lg: 0.75rem;  /* 12px */
  
  /* Transitions */
  --transition-fast: 100ms ease-out;
  --transition-base: 150ms ease;
  --transition-slow: 200ms ease-in-out;
}
```

### Font Loading

Load fonts from Google Fonts CDN in the HTML head:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@600&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
```

### Typography Classes

Create utility classes for common typography patterns:

```css
.text-display {
  font-family: var(--font-display);
  font-weight: 600;
}

.text-body {
  font-family: var(--font-body);
  font-weight: 400;
}

.text-label {
  font-family: var(--font-body);
  font-weight: 500;
}

.text-mono {
  font-family: var(--font-mono);
  font-weight: 400;
}

.text-mono-bold {
  font-family: var(--font-mono);
  font-weight: 600;
}
```

### Component Example: Metric Card

```html
<div class="metric-card">
  <div class="metric-label">Total Portfolio Value</div>
  <div class="metric-value">$48.2M</div>
  <div class="metric-change">+12.4% vs last quarter</div>
</div>
```

```css
.metric-card {
  padding: var(--space-xl);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--card-background);
}

.metric-label {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 500;
  margin-bottom: var(--space-sm);
}

.metric-value {
  font-family: var(--font-mono);
  font-size: var(--text-4xl);
  font-weight: 600;
  margin-bottom: var(--space-sm);
}

.metric-change {
  font-family: var(--font-body);
  font-size: var(--text-xs);
}
```

---

## Design Checklist

Use this checklist when implementing new features or pages:

**Typography**
- [ ] Page title uses IBM Plex Sans 30px Semi-Bold
- [ ] Section headers use IBM Plex Sans 24px Semi-Bold
- [ ] Body text uses Inter 14px Regular
- [ ] All numerical data uses JetBrains Mono
- [ ] Line heights meet minimum 1.4 for body text
- [ ] No text smaller than 12px

**Layout**
- [ ] All spacing aligns to 8px grid
- [ ] Card padding is 32px
- [ ] Section gaps are 24px minimum
- [ ] Layout avoids centered composition (uses asymmetric grid)
- [ ] Whitespace is generous and purposeful

**Components**
- [ ] Interactive elements have 40px minimum height
- [ ] Buttons use Inter 14px Medium
- [ ] Table numbers align vertically using monospace font
- [ ] Hover states transition in 150ms
- [ ] Focus states show 2px outline

**Accessibility**
- [ ] All interactive elements keyboard accessible
- [ ] Focus indicators always visible
- [ ] Heading hierarchy is semantic (h1, h2, h3)
- [ ] Touch targets are 40px minimum
- [ ] ARIA labels provided where needed

**Responsive**
- [ ] Layout adapts at 640px and 1024px breakpoints
- [ ] Tables handle overflow appropriately
- [ ] Touch interactions work on mobile
- [ ] Font sizes scale appropriately

---

## Summary

This design system creates a professional, data-focused interface through systematic application of Swiss Modernist principles. The typography system uses three carefully selected fonts (IBM Plex Sans for display, Inter for body text, JetBrains Mono for numerical data) to create clear hierarchy and ensure perfect alignment of financial data. The layout system follows an 8-pixel grid with generous whitespace and asymmetric composition to maximize clarity while maintaining visual interest. All components follow consistent patterns for spacing, typography, and interaction, ensuring predictability and reducing cognitive load. The system prioritizes accessibility through proper semantic structure, adequate touch targets, and always-visible focus indicators. By following these guidelines, you will create interfaces that communicate financial data with absolute clarity while maintaining professional sophistication.

---

**Document Version**: 1.0  
**Last Updated**: January 2026  
**Author**: Manus AI
