import { type BrandPalette } from "./exportStyles";

export interface BrandingData {
  userName: string;
  companyName: string;
  logoUrl: string | null;
}

export interface ResearchExportOptions {
  type: "property" | "company" | "global";
  title: string;
  subtitle?: string;
  content: any;
  updatedAt?: string;
  llmModel?: string;
  promptConditions?: Record<string, any>;
  branding?: BrandingData;
  themeColors?: import("./exportStyles").ThemeColor[];
}

export async function fetchBranding(): Promise<BrandingData> {
  try {
    const res = await fetch("/api/branding", { credentials: "include" });
    if (res.ok) return await res.json();
  } catch (_error: unknown) {
    /* branding fetch optional - fallback to defaults */
  }
  return { userName: "", companyName: "", logoUrl: null };
}

export async function loadLogoImage(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url;
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error: unknown) {
    console.error("Failed to load logo image:", error);
    return null;
  }
}

export function sectionColors(brand: BrandPalette): [number, number, number][] {
  const hexToRgb = (hex: string): [number, number, number] => {
    const h = hex.replace(/^#/, "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };

  const sources: string[] = [
    brand.ACCENT_HEX,
    ...brand.LINE_HEX.slice(1),
    ...brand.CHART_HEX,
  ];

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const h of sources) {
    const key = h.replace(/^#/, "").toUpperCase();
    if (!seen.has(key)) { seen.add(key); unique.push(h); }
  }

  return unique.map(hexToRgb);
}

export function brandedHeader(doc: any, pageW: number, height: number, brand: BrandPalette) {
  doc.setFillColor(...brand.PRIMARY_RGB);
  doc.rect(0, 0, pageW, height, "F");
  doc.setFillColor(...brand.ACCENT_RGB);
  doc.rect(0, height - 4, pageW, 2, "F");
}

export function addSectionHeader(doc: any, title: string, y: number, color: [number, number, number]): number {
  if (y > 260) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...color);
  doc.text(title, 14, y);
  y += 2;
  doc.setDrawColor(...color);
  doc.setLineWidth(0.5);
  doc.line(14, y, 80, y);
  return y + 6;
}

export function addParagraph(doc: any, text: string, y: number, pageW: number, brand: BrandPalette): number {
  if (!text) return y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...brand.FOREGROUND_RGB);
  const lines = doc.splitTextToSize(text, pageW - 28);
  for (const line of lines) {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.text(line, 14, y);
    y += 4.5;
  }
  return y + 2;
}

export function addKeyValue(doc: any, label: string, value: string, y: number, brand: BrandPalette): number {
  if (y > 275) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...brand.MUTED_RGB);
  doc.text(label + ":", 18, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...brand.FOREGROUND_RGB);
  doc.text(value || "N/A", 70, y);
  return y + 5;
}

export function addBulletList(doc: any, items: string[], y: number, pageW: number, brand: BrandPalette): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...brand.FOREGROUND_RGB);
  for (const item of items) {
    if (y > 275) { doc.addPage(); y = 20; }
    const lines = doc.splitTextToSize(`• ${item}`, pageW - 32);
    for (const line of lines) {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(line, 18, y);
      y += 4;
    }
    y += 1;
  }
  return y + 2;
}

export function addTable(doc: any, autoTable: any, headers: string[], rows: string[][], y: number, color: [number, number, number], brand: BrandPalette): number {
  if (y > 240) { doc.addPage(); y = 20; }
  autoTable(doc, {
    startY: y,
    head: [headers],
    body: rows,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: color, textColor: brand.WHITE_RGB, fontStyle: "bold" },
    alternateRowStyles: { fillColor: brand.SURFACE_RGB },
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable!.finalY + 8;
}
