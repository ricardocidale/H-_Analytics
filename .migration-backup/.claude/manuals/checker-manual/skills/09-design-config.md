# Chapter 9: Design Configuration

The platform uses a consistent design system across all pages. The checker should verify visual consistency and ensure that all elements render correctly in both theme modes. While design verification is secondary to financial accuracy, a well-rendered interface is essential for reliable data interpretation during the verification process.

---

## Color Palette

The platform's brand identity is built around a carefully selected color palette:

| Color | Hex Code | Usage |
|-------|----------|-------|
| Sage Green | #9FBCA4 | Primary brand color, buttons, active states, chart revenue lines |
| Secondary Green | #257D41 | Accent highlights, success indicators |
| Warm Off-White | #FFF9F5 | Light mode backgrounds, content areas |
| Coral Accent | #E07A5F | Alerts, FCFE chart lines, attention-drawing elements |
| Black | #000000 | Text, dark mode elements |
| Dark Blue-Gray | Gradient | Navigation sidebar, glass-effect backgrounds |

---

## Typography

Two typefaces are used throughout the platform:

| Typeface | Style | Usage |
|----------|-------|-------|
| Playfair Display | Serif | Page headings, section titles, brand typography |
| Inter | Sans-serif | Body text, UI labels, data tables, form inputs, numerical values |

---

## Theme Modes

The application operates in two distinct visual themes depending on the page context:

**Dark Glass Theme** is applied to the main application pages, including the Dashboard, Property Detail, Portfolio, Company, Financing Analysis, Sensitivity Analysis, and Investment Analysis. These pages feature dark blue-gray gradient backgrounds, frosted glass panels with backdrop blur effects, white text, translucent borders, and subtle top-edge highlight gradients.

**Light Theme** is applied to assumption and editing pages, including Property Edit, Global Assumptions, Company Assumptions, Settings, and Profile. These pages use warm off-white backgrounds, dark text, clean borders, and standard form styling.

---

## Chart Styling

All financial charts follow a consistent visual language. Charts use a white background with light gray dashed grid lines. Revenue data is rendered in sage green gradient, GOP in blue gradient, and FCFE in coral accent. Data points are marked with visible dots, axis labels use the Inter font in gray, and tooltips appear as rounded cards showing value and label information.

---

## Table Styling

Financial tables follow the USALI-informed structure. Section headers appear in bold with a distinct background. Subtotal rows use bold text with a top border separator. Grand total rows are emphasized with bold text, heavier borders, and a distinct background. Data cells are right-aligned for numeric values with monospace-influenced formatting. Negative values are displayed in parentheses — for example, ($1,234). Rows highlight subtly on hover.

---

## Navigation

The navigation sidebar uses a dark blue-gray gradient background with the brand logo at top and navigation links with icons. The active page is highlighted with a sage green accent. Breadcrumbs are available on detail and edit pages for hierarchical navigation. The interface is responsive, with the sidebar collapsing to a menu on smaller viewports.

---

## Checker Visual Consistency Checklist

| Check | Description |
|-------|-------------|
| ☐ | All dark-theme pages use consistent glass-effect backgrounds |
| ☐ | All light-theme pages use warm off-white backgrounds |
| ☐ | Headings use Playfair Display; data uses Inter |
| ☐ | Charts use correct color mapping (green = revenue, blue = GOP, coral = FCFE) |
| ☐ | KPI cards display consistent formatting across Dashboard and detail pages |
| ☐ | Export Menu renders correctly in both glass and light variants |
| ☐ | Financial tables follow consistent row styling and number formatting |
| ☐ | Negative values displayed in parentheses format |
| ☐ | Navigation sidebar shows correct active state highlighting |
| ☐ | All pages are responsive and readable on smaller screens |
| ☐ | Color palette matches the hex codes specified above |
| ☐ | No visual inconsistencies between pages using the same theme |
