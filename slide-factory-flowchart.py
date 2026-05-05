"""
Slide Factory Flowchart — produces slide-factory-flowchart.pdf
Two-pipeline layout: Per-Property (left) and LB Portfolio (right),
with shared infrastructure at the bottom.
"""

from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.lib.colors import HexColor

PAGE_W, PAGE_H = landscape(A3)

# ── Palette ────────────────────────────────────────────────────────────────────
C_HEADER   = HexColor("#1a2e4a")   # dark navy    — section headers
C_TRIGGER  = HexColor("#2563eb")   # blue         — trigger / admin action
C_SERVER   = HexColor("#0f766e")   # teal         — server / API logic
C_RENDER   = HexColor("#7c3aed")   # purple       — Playwright / render
C_STORAGE  = HexColor("#c2410c")   # orange-red   — R2 / DB storage
C_SHARED   = HexColor("#4b5563")   # slate        — shared infra
C_DECISION = HexColor("#b45309")   # amber        — decision diamond
C_TEXT     = HexColor("#ffffff")   # white        — box text
C_GREY     = HexColor("#6b7280")   # grey         — arrows & borders
C_BG       = HexColor("#f8fafc")   # near-white   — page background

BOX_W  = 87 * mm
BOX_H  = 11 * mm
DIA_W  = 78 * mm
DIA_H  = 16 * mm
FONT   = "Helvetica"
FONTB  = "Helvetica-Bold"


def box(c, x, y, w, h, label, sublabel=None, fill=C_SERVER, radius=3):
    """Draw a rounded-rect node."""
    c.setFillColor(fill)
    c.setStrokeColor(HexColor("#00000022"))
    c.setLineWidth(0.5)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)
    c.setFillColor(C_TEXT)
    if sublabel:
        c.setFont(FONTB, 7.5)
        c.drawCentredString(x + w / 2, y + h / 2 + 2.5, label)
        c.setFont(FONT, 6.5)
        c.setFillColor(HexColor("#e2e8f0"))
        c.drawCentredString(x + w / 2, y + h / 2 - 4.5, sublabel)
    else:
        c.setFont(FONTB, 7.5)
        c.drawCentredString(x + w / 2, y + h / 2 - 2.5, label)


def diamond(c, cx, cy, w, h, label, fill=C_DECISION):
    """Draw a diamond decision node."""
    hw, hh = w / 2, h / 2
    c.setFillColor(fill)
    c.setStrokeColor(HexColor("#00000033"))
    c.setLineWidth(0.5)
    p = c.beginPath()
    p.moveTo(cx, cy + hh)
    p.lineTo(cx + hw, cy)
    p.lineTo(cx, cy - hh)
    p.lineTo(cx - hw, cy)
    p.close()
    c.drawPath(p, fill=1, stroke=1)
    c.setFillColor(C_TEXT)
    c.setFont(FONTB, 7)
    c.drawCentredString(cx, cy - 2.5, label)


def arrow(c, x1, y1, x2, y2, label=None, color=C_GREY):
    """Draw a vertical or L-shaped arrow with optional label."""
    c.setStrokeColor(color)
    c.setLineWidth(1)
    c.setFillColor(color)
    ah = 3
    if abs(x1 - x2) < 1:
        # straight vertical — draw from top edge down to tip
        c.line(x1, y1, x2, y2 + ah * 1.5)
        p = c.beginPath()
        p.moveTo(x2, y2)
        p.lineTo(x2 - ah, y2 + ah * 1.5)
        p.lineTo(x2 + ah, y2 + ah * 1.5)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
    else:
        # L-shape (go down to midpoint, across, then down to target)
        mid_y = (y1 + y2) / 2
        c.line(x1, y1, x1, mid_y)
        c.line(x1, mid_y, x2, mid_y)
        c.line(x2, mid_y, x2, y2 + ah * 1.5)
        p = c.beginPath()
        p.moveTo(x2, y2)
        p.lineTo(x2 - ah, y2 + ah * 1.5)
        p.lineTo(x2 + ah, y2 + ah * 1.5)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
    if label:
        mx = (x1 + x2) / 2
        my = (y1 + y2) / 2
        c.setFont(FONT, 6)
        c.setFillColor(HexColor("#374151"))
        c.drawCentredString(mx, my + 2, label)


def side_label(c, x, y, w, h, text, color):
    """Side badge (yes/no on diamond branches)."""
    c.setFont(FONT, 6)
    c.setFillColor(color)
    c.drawString(x, y, text)


def section_header(c, x, y, w, h, text):
    c.setFillColor(C_HEADER)
    c.roundRect(x, y, w, h, 3, fill=1, stroke=0)
    c.setFillColor(C_TEXT)
    c.setFont(FONTB, 9)
    c.drawCentredString(x + w / 2, y + h / 2 - 3, text)


def divider_line(c, x, y1, x2, y2):
    c.setStrokeColor(HexColor("#94a3b8"))
    c.setLineWidth(0.5)
    c.setDash(4, 3)
    c.line(x, y1, x2, y2)
    c.setDash()


def draw_flowchart(c):
    # ── Page background ─────────────────────────────────────────────────────────
    c.setFillColor(C_BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # ── Title ───────────────────────────────────────────────────────────────────
    c.setFillColor(C_HEADER)
    c.rect(0, PAGE_H - 20 * mm, PAGE_W, 20 * mm, fill=1, stroke=0)
    c.setFillColor(C_TEXT)
    c.setFont(FONTB, 14)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 13 * mm, "Slide Factory — Render Pipeline")
    c.setFont(FONT, 8)
    c.setFillColor(HexColor("#cbd5e1"))
    c.drawCentredString(PAGE_W / 2, PAGE_H - 7 * mm,
        "Per-Property Deck  ·  LB Portfolio Deck  ·  Shared Infrastructure")

    MARGIN   = 12 * mm
    GAP      = 10 * mm   # gap between columns
    COL_W    = (PAGE_W - 2 * MARGIN - GAP) / 2
    COL_L    = MARGIN                      # left column x
    COL_R    = MARGIN + COL_W + GAP        # right column x
    TOP_Y    = PAGE_H - 28 * mm           # first node top

    BX_L  = COL_L + (COL_W - BOX_W) / 2   # centred box x within left col
    BX_R  = COL_R + (COL_W - BOX_W) / 2   # centred box x within right col
    CX_L  = BX_L + BOX_W / 2              # centre x left
    CX_R  = BX_R + BOX_W / 2              # centre x right

    STEP  = BOX_H + 6 * mm   # vertical step between nodes

    # ─────────────────────────────────────────────────────────────────────────────
    # LEFT COLUMN — Per-Property Deck
    # ─────────────────────────────────────────────────────────────────────────────
    y = TOP_Y

    # Header
    section_header(c, COL_L, y - 8 * mm, COL_W, 8 * mm, "PER-PROPERTY DECK")
    y -= 8 * mm

    # 1. Trigger
    y -= STEP
    box(c, BX_L, y, BOX_W, BOX_H,
        'Admin clicks "Download PDF"',
        "POST /api/properties/:id/deck.pdf",
        fill=C_TRIGGER)
    a1_y = y + BOX_H / 2

    # 2. Cache decision
    y -= (STEP + 2 * mm)
    dia_top = y
    dia_cx = CX_L
    dia_cy = y - DIA_H / 2
    diamond(c, dia_cx, dia_cy, DIA_W, DIA_H, "R2 cache fresh?", fill=C_DECISION)
    arrow(c, CX_L, a1_y, CX_L, dia_cy + DIA_H / 2)

    # YES branch — serve from R2
    c.setFont(FONT, 6.5)
    c.setFillColor(HexColor("#15803d"))
    c.drawString(dia_cx + DIA_W / 2 + 2, dia_cy - 2, "YES")
    serve_x = BX_L + BOX_W + 4 * mm
    serve_y = dia_cy - BOX_H / 2
    box(c, serve_x, serve_y, 42 * mm, BOX_H,
        "Serve from R2 (redirect)", fill=C_STORAGE)
    arrow(c, dia_cx + DIA_W / 2, dia_cy, serve_x, serve_y + BOX_H / 2,
          color=HexColor("#15803d"))

    # NO arrow label
    c.setFont(FONT, 6.5)
    c.setFillColor(HexColor("#dc2626"))
    c.drawString(dia_cx + 2, dia_cy - DIA_H / 2 - 5, "NO — render")

    # 3. Sign HMAC token
    y = dia_cy - DIA_H / 2 - STEP
    box(c, BX_L, y, BOX_W, BOX_H,
        "Sign HMAC token",
        "propertyId · expiresAtMs · sig  (5 min TTL)",
        fill=C_SERVER)
    arrow(c, CX_L, dia_cy - DIA_H / 2, CX_L, y + BOX_H)
    tok_y = y

    # 4. Build payload
    y -= STEP
    box(c, BX_L, y, BOX_W, BOX_H,
        "buildSlidePayload(propertyId)",
        "property · photos (base64) · financials · siblings · editor copy",
        fill=C_SERVER)
    arrow(c, CX_L, tok_y, CX_L, y + BOX_H)
    pay_y = y

    # 5. Playwright
    y -= STEP
    box(c, BX_L, y, BOX_W, BOX_H,
        "Playwright: navigate  /internal/deck/:id?token=…",
        "Singleton Chromium · 1920×1080 viewport",
        fill=C_RENDER)
    arrow(c, CX_L, pay_y, CX_L, y + BOX_H)
    pw_y = y

    # 6. React render
    y -= STEP
    box(c, BX_L, y, BOX_W, BOX_H,
        "React renders Slide1 – Slide6",
        "InternalDeck.tsx  ·  GET /api/internal/deck-payload/:id?token=…",
        fill=C_RENDER)
    arrow(c, CX_L, pw_y, CX_L, y + BOX_H)
    react_y = y

    # 7. Wait ready
    y -= STEP
    box(c, BX_L, y, BOX_W, BOX_H,
        "Wait: window.__deckReady = true",
        "useImagesReady() polls all <img> · 10 s timeout",
        fill=C_RENDER)
    arrow(c, CX_L, react_y, CX_L, y + BOX_H)
    ready_y = y

    # 8. page.pdf()
    y -= STEP
    box(c, BX_L, y, BOX_W, BOX_H,
        "page.pdf()",
        "printBackground: true  ·  preferCSSPageSize: true",
        fill=C_RENDER)
    arrow(c, CX_L, ready_y, CX_L, y + BOX_H)
    pdf_y = y

    # 9. Upload R2
    y -= STEP
    box(c, BX_L, y, BOX_W, BOX_H,
        "Upload PDF → R2",
        "slides/pdf/{DECK_LOGIC_VERSION}/property-{id}.pdf",
        fill=C_STORAGE)
    arrow(c, CX_L, pdf_y, CX_L, y + BOX_H)
    r2_y = y

    # 10. Update DB
    y -= STEP
    box(c, BX_L, y, BOX_W, BOX_H,
        "Update DB row",
        "property_slide_deck_variants  →  status='ready'",
        fill=C_STORAGE)
    arrow(c, CX_L, r2_y, CX_L, y + BOX_H)
    db_y = y

    # 11. Stream to browser
    y -= STEP
    box(c, BX_L, y, BOX_W, BOX_H,
        "Stream PDF to browser",
        "GET /api/properties/:id/deck.pdf  →  signed R2 URL",
        fill=C_TRIGGER)
    arrow(c, CX_L, db_y, CX_L, y + BOX_H)

    LEFT_BOTTOM = y

    # ─────────────────────────────────────────────────────────────────────────────
    # RIGHT COLUMN — LB Portfolio Deck
    # ─────────────────────────────────────────────────────────────────────────────
    y = TOP_Y

    # Header
    section_header(c, COL_R, y - 8 * mm, COL_W, 8 * mm, "LB PORTFOLIO DECK")
    y -= 8 * mm

    # 1. Admin config
    y -= STEP
    box(c, BX_R, y, BOX_W, BOX_H,
        "Admin configures slide assignments",
        "GET/POST /api/lb-slides/config  ·  lb_slides_config (DB)",
        fill=C_TRIGGER)
    cfg_y = y

    # 2. Trigger render
    y -= STEP
    box(c, BX_R, y, BOX_W, BOX_H,
        'Admin triggers "Render"',
        "POST /api/lb-slides/render",
        fill=C_TRIGGER)
    arrow(c, CX_R, cfg_y, CX_R, y + BOX_H)
    ren_y = y

    # 3. Sign LB token
    y -= STEP
    box(c, BX_R, y, BOX_W, BOX_H,
        "Sign HMAC token",
        "lb · expiresAtMs · sig  (separate namespace, 5 min TTL)",
        fill=C_SERVER)
    arrow(c, CX_R, ren_y, CX_R, y + BOX_H)
    ltok_y = y

    # 4. Build composite payload
    y -= STEP
    box(c, BX_R, y, BOX_W, BOX_H,
        "buildLbPayload()  →  LbSlidePayload",
        "Slides 1/2/3/5: buildSlidePayload(assignedId)  ·  4: portfolio grid  ·  6: 10-yr aggregate",
        fill=C_SERVER)
    arrow(c, CX_R, ltok_y, CX_R, y + BOX_H)
    lpay_y = y

    # 5. Playwright
    y -= STEP
    box(c, BX_R, y, BOX_W, BOX_H,
        "Playwright: navigate  /internal/lb-deck?token=…",
        "Singleton Chromium · 1920×1080 viewport",
        fill=C_RENDER)
    arrow(c, CX_R, lpay_y, CX_R, y + BOX_H)
    lpw_y = y

    # 6. React render all 6
    y -= STEP
    box(c, BX_R, y, BOX_W, BOX_H,
        "React renders all 6 slides from composite payload",
        "LbInternalDeck.tsx  ·  GET /api/internal/lb-deck-payload?token=…",
        fill=C_RENDER)
    arrow(c, CX_R, lpw_y, CX_R, y + BOX_H)
    lreact_y = y

    # 7. Wait ready
    y -= STEP
    box(c, BX_R, y, BOX_W, BOX_H,
        "Wait: window.__deckReady = true",
        "useImagesReady() polls all <img> · 10 s timeout",
        fill=C_RENDER)
    arrow(c, CX_R, lreact_y, CX_R, y + BOX_H)
    lready_y = y

    # 8. page.pdf()
    y -= STEP
    box(c, BX_R, y, BOX_W, BOX_H,
        "page.pdf()",
        "printBackground: true  ·  preferCSSPageSize: true",
        fill=C_RENDER)
    arrow(c, CX_R, lready_y, CX_R, y + BOX_H)
    lpdf_y = y

    # 9. Upload R2
    y -= STEP
    box(c, BX_R, y, BOX_W, BOX_H,
        "Upload PDF → R2",
        "lb-slides/pdf/{DECK_LOGIC_VERSION}/lb-deck.pdf",
        fill=C_STORAGE)
    arrow(c, CX_R, lpdf_y, CX_R, y + BOX_H)
    lr2_y = y

    # 10. Status → ready
    y -= STEP
    box(c, BX_R, y, BOX_W, BOX_H,
        "Set in-memory status = 'ready'",
        "GET /api/lb-slides/render-status  (poll)",
        fill=C_STORAGE)
    arrow(c, CX_R, lr2_y, CX_R, y + BOX_H)
    lst_y = y

    # 11. Download
    y -= STEP
    box(c, BX_R, y, BOX_W, BOX_H,
        "Stream PDF to browser",
        "GET /api/lb-slides/download/combined.pdf  →  R2 stream",
        fill=C_TRIGGER)
    arrow(c, CX_R, lst_y, CX_R, y + BOX_H)

    RIGHT_BOTTOM = y

    # ─────────────────────────────────────────────────────────────────────────────
    # SHARED INFRASTRUCTURE BAND
    # ─────────────────────────────────────────────────────────────────────────────
    INF_TOP  = min(LEFT_BOTTOM, RIGHT_BOTTOM) - 16 * mm
    INF_H    = 28 * mm
    INF_Y    = INF_TOP - INF_H

    c.setFillColor(HexColor("#f1f5f9"))
    c.setStrokeColor(HexColor("#94a3b8"))
    c.setLineWidth(0.8)
    c.roundRect(MARGIN, INF_Y, PAGE_W - 2 * MARGIN, INF_H, 4, fill=1, stroke=1)

    c.setFont(FONTB, 8)
    c.setFillColor(C_SHARED)
    c.drawCentredString(PAGE_W / 2, INF_Y + INF_H - 7, "SHARED INFRASTRUCTURE")

    cell_w = (PAGE_W - 2 * MARGIN - 4 * GAP) / 4
    cells = [
        ("Playwright Browser",   "Singleton Chromium\nLazy launch · auto-relaunch\nSIGTERM teardown",      C_RENDER),
        ("renderLimiter",        "pLimit (max 2 concurrent)\nQueue: FIFO ordering\nPDF_RENDER_CONCURRENCY", C_SHARED),
        ("R2 Object Storage",    "Cached PDFs by version key\nDECK_LOGIC_VERSION invalidates\nSigned URLs", C_STORAGE),
        ("HMAC Token Security",  "5-min TTL · SHA-256\nNamespaced (property vs lb)\nverifyToken() checks",  C_SERVER),
    ]
    for i, (title, body, fill) in enumerate(cells):
        cx = MARGIN + i * (cell_w + GAP)
        cy = INF_Y + 2 * mm
        bh = INF_H - 10 * mm
        c.setFillColor(fill)
        c.setStrokeColor(HexColor("#00000011"))
        c.setLineWidth(0.4)
        c.roundRect(cx, cy, cell_w, bh, 3, fill=1, stroke=1)
        c.setFillColor(C_TEXT)
        c.setFont(FONTB, 7)
        c.drawCentredString(cx + cell_w / 2, cy + bh - 6, title)
        c.setFont(FONT, 6)
        lines = body.split("\n")
        for j, line in enumerate(lines):
            c.drawCentredString(cx + cell_w / 2, cy + bh - 13 - j * 7, line)

    # ── Divider between columns ─────────────────────────────────────────────────
    divider_line(c, PAGE_W / 2, TOP_Y - 8 * mm, PAGE_W / 2, INF_TOP - 4 * mm)

    # ── Legend ──────────────────────────────────────────────────────────────────
    legend_items = [
        (C_TRIGGER, "Admin / API trigger"),
        (C_SERVER,  "Server / build logic"),
        (C_RENDER,  "Playwright render"),
        (C_STORAGE, "Storage (R2 / DB)"),
        (C_DECISION,"Cache decision"),
    ]
    lx = MARGIN
    ly = 4 * mm
    c.setFont(FONTB, 7)
    c.setFillColor(C_HEADER)
    c.drawString(lx, ly, "LEGEND:")
    lx += 16 * mm
    for col, label in legend_items:
        c.setFillColor(col)
        c.rect(lx, ly - 1, 9, 9, fill=1, stroke=0)
        c.setFillColor(HexColor("#374151"))
        c.setFont(FONT, 6.5)
        c.drawString(lx + 11, ly, label)
        lx += 38 * mm

    # ── Watermark ───────────────────────────────────────────────────────────────
    c.setFont(FONT, 6)
    c.setFillColor(HexColor("#94a3b8"))
    c.drawRightString(PAGE_W - MARGIN, 4 * mm, "H+ Analytics  ·  Slide Factory Pipeline")


def main():
    out = "slide-factory-flowchart.pdf"
    c = pdfcanvas.Canvas(out, pagesize=landscape(A3))
    c.setTitle("Slide Factory — Render Pipeline")
    c.setAuthor("H+ Analytics")
    draw_flowchart(c)
    c.save()
    print(f"Created: {out}")


if __name__ == "__main__":
    main()
