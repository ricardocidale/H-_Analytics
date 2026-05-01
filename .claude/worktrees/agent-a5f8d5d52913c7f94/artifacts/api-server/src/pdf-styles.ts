
import { type ThemeColorMap, resolveThemeColors, adjustHex } from "./theme-resolver";

export function buildPdfStylesheet(
  data: { orientation?: string; colors?: ThemeColorMap; densePagination?: boolean }
): string {
  const isL = data.orientation === "landscape";
  const pageW = isL ? "406.4mm" : "215.9mm";
  const pageH = isL ? "228.6mm" : "279.4mm";
  const c = data.colors || resolveThemeColors();
  const NAVY = `#${c.navy}`;
  const SAGE = `#${c.sage}`;
  const DK = `#${c.darkGreen}`;
  const TXT = `#${c.darkText}`;
  const GR = `#${c.gray}`;
  const ALT = `#${c.altRow}`;
  const SECBG = `#${c.sectionBg}`;
  const WHITE = `#${c.white}`;

  return `
@page { size: ${pageW} ${pageH}; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: ${TXT};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  font-feature-settings: 'liga' 1, 'kern' 1;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
.val-neg { color: #${c.negativeRed}; }

.cover-page {
  width: ${pageW}; height: ${pageH};
  background: linear-gradient(155deg, #${adjustHex(c.navy, 12)} 0%, ${NAVY} 35%, #${adjustHex(c.navy, -8)} 100%);
  position: relative; overflow: hidden;
  page-break-after: always;
}
.cover-accent-top {
  position: absolute; top: 0; left: 0; right: 0; height: 3.5mm;
  background: linear-gradient(90deg, ${DK}, ${SAGE}, ${DK});
}
.cover-accent-bottom {
  position: absolute; bottom: 0; left: 0; right: 0; height: 3.5mm;
  background: linear-gradient(90deg, ${SAGE}, ${DK}, ${SAGE});
}
.cover-geometric {
  position: absolute;
  right: ${isL ? "-30mm" : "-20mm"};
  top: 15%;
  width: ${isL ? "180mm" : "120mm"};
  height: ${isL ? "180mm" : "120mm"};
  border: 1.5px solid ${SAGE}1f;
  border-radius: 50%;
}
.cover-geometric::after {
  content: '';
  position: absolute;
  top: 15%; left: 15%; right: 15%; bottom: 15%;
  border: 1px solid ${SAGE}14;
  border-radius: 50%;
}
.cover-sage-bar {
  position: absolute;
  left: ${isL ? "35mm" : "23mm"};
  top: ${isL ? "27%" : "21%"};
  width: 2mm; height: 42mm;
  background: linear-gradient(180deg, ${SAGE}, ${DK});
  border-radius: 1mm;
}
.cover-content {
  position: absolute;
  left: ${isL ? "42mm" : "30mm"};
  top: ${isL ? "28%" : "22%"};
  right: ${isL ? "50%" : "30mm"};
}
.cover-badge {
  display: inline-block;
  font-size: 7pt; font-weight: 700;
  letter-spacing: 3px; color: ${SAGE};
  border: 1.5px solid color-mix(in srgb, ${SAGE} 50%, transparent);
  padding: 2mm 5mm; border-radius: 1.2mm;
  margin-bottom: 10mm;
}
.cover-company {
  font-size: ${isL ? "40pt" : "34pt"};
  font-weight: 800; color: ${WHITE};
  letter-spacing: -0.5px; line-height: 1.08;
  margin-bottom: 6mm;
}
.cover-rule {
  width: 50mm; height: 1mm;
  background: linear-gradient(90deg, ${DK}, ${SAGE});
  border-radius: 0.5mm; margin-bottom: 7mm;
}
.cover-title {
  font-size: ${isL ? "18pt" : "16pt"};
  color: color-mix(in srgb, ${WHITE} 75%, transparent);
  font-weight: 400; letter-spacing: 0.3px;
  line-height: 1.4; margin-bottom: 3mm;
}
.cover-subtitle {
  font-size: 11pt; color: color-mix(in srgb, ${WHITE} 50%, transparent);
  font-weight: 300; margin-bottom: 8mm;
}
.cover-meta-card {
  margin-top: 14mm;
  background: color-mix(in srgb, ${NAVY} 60%, transparent);
  border: 1px solid color-mix(in srgb, ${SAGE} 35%, transparent);
  border-radius: 2mm;
  padding: 5mm 6mm;
}
.cover-meta-grid {
  display: flex; gap: 18mm;
}
.cover-meta-item { display: flex; flex-direction: column; gap: 2mm; }
.cover-meta-label {
  font-size: 6.5pt; font-weight: 700;
  letter-spacing: 2px; color: ${SAGE};
}
.cover-meta-value {
  font-size: 10pt; color: color-mix(in srgb, ${WHITE} 85%, transparent); font-weight: 500;
}
.cover-footer {
  position: absolute;
  left: ${isL ? "42mm" : "30mm"};
  right: ${isL ? "42mm" : "30mm"};
  bottom: 7%;
  border-top: 1px solid color-mix(in srgb, ${WHITE} 10%, transparent);
  padding-top: 3mm;
}
.cover-footer p {
  font-size: 7pt; color: color-mix(in srgb, ${WHITE} 35%, transparent);
  font-style: italic; line-height: 1.6;
}

.content-page {
  width: ${data.densePagination !== false ? "auto" : pageW};
  ${data.densePagination !== false ? "" : `height: ${pageH};`}
  padding: ${isL ? "4mm 22mm 20mm" : "4mm 18mm 20mm"};
  position: relative;
  ${data.densePagination !== false ? "break-inside: avoid; margin-bottom: 6mm;" : "page-break-after: always;"}
  background: ${WHITE};
  display: flex;
  flex-direction: column;
}
.content-page::after {
  content: ''; position: absolute;
  bottom: 0; left: 0; right: 0; height: 1.2mm;
  background: linear-gradient(90deg, ${SAGE}, ${DK});
}

.page-hdr {
  flex-shrink: 0;
  margin: 0 -22mm 5mm;
  padding: 0 22mm;
}
.page-hdr-bar {
  background: ${NAVY};
  padding: 4.5mm 7mm 4mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 0 0 2mm 2mm;
}
.page-hdr-title {
  font-size: ${isL ? "18pt" : "16pt"};
  font-weight: 700; color: ${WHITE};
  letter-spacing: 0.2px;
}
.page-hdr-sub {
  font-size: 8.5pt; color: color-mix(in srgb, ${WHITE} 55%, transparent);
  margin-top: 1mm; display: block;
  letter-spacing: 0.3px;
}
.page-hdr-brand {
  font-size: 8pt; color: ${SAGE}; font-weight: 600;
  letter-spacing: 0.5px; white-space: nowrap;
}

.toc-body {
  flex: 1; display: flex; flex-direction: column;
  justify-content: center;
  padding: 0 ${isL ? "40mm" : "10mm"};
}
.toc-row {
  display: flex; align-items: baseline;
  padding: 3.5mm 0;
  border-bottom: 1px solid ${GR};
}
.toc-row:last-child { border-bottom: none; }
.toc-num {
  font-size: 9pt; font-weight: 700; color: ${SAGE};
  width: 10mm; flex-shrink: 0;
}
.toc-label {
  font-size: 11pt; font-weight: 500; color: ${TXT};
  flex-shrink: 0;
}
.toc-dots {
  flex: 1; margin: 0 3mm;
  border-bottom: 1px dotted ${GR};
  min-width: 10mm;
  align-self: flex-end;
  margin-bottom: 2px;
}
.toc-page {
  font-size: 10pt; font-weight: 700; color: ${NAVY};
  flex-shrink: 0;
}

.summary-body { flex: 1; display: flex; flex-direction: column; }
.summary-text-block { margin-bottom: 4mm; }
.summary-para {
  font-size: 10.5pt; line-height: 1.75; color: ${TXT};
  margin-bottom: 4mm; text-align: justify;
}
.summary-divider {
  height: 1px; background: linear-gradient(90deg, ${DK}, ${SAGE}, transparent);
  margin: 5mm 0;
}
.section-label {
  font-size: 8pt; font-weight: 700; letter-spacing: 2px;
  color: ${DK}; margin-bottom: 4mm;
}
.highlights-grid {
  display: grid;
  grid-template-columns: repeat(${isL ? 3 : 2}, 1fr);
  gap: 4mm;
}
.highlight-card {
  background: ${ALT}; border: 1px solid ${GR};
  border-radius: 2mm; overflow: hidden;
  display: flex;
}
.highlight-accent { width: 3mm; flex-shrink: 0; }
.highlight-body { padding: 4mm 5mm; }
.highlight-value {
  font-size: 16pt; font-weight: 700;
  margin-bottom: 1mm; letter-spacing: -0.3px;
}
.highlight-label {
  font-size: 8pt; font-weight: 600; color: ${GR};
  letter-spacing: 0.3px; margin-bottom: 1mm;
}
.highlight-desc {
  font-size: 7pt; color: ${GR}; line-height: 1.4;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(${isL ? 3 : 2}, 1fr);
  gap: 5mm; margin-top: 3mm;
}
.kpi-card {
  background: ${ALT}; border: 1px solid ${GR};
  border-radius: 2.5mm; overflow: hidden; text-align: center;
}
.kpi-accent { height: 2.5mm; }
.kpi-body { padding: 6mm 5mm 7mm; }
.kpi-value {
  font-size: 28pt; font-weight: 800;
  letter-spacing: -0.5px; margin-bottom: 2mm;
}
.kpi-label {
  font-size: 9.5pt; color: ${GR}; font-weight: 600;
  letter-spacing: 0.2px; margin-bottom: 1.5mm;
}
.kpi-desc {
  font-size: 7.5pt; color: ${GR}; line-height: 1.35;
  max-width: 90%; margin: 0 auto;
}

.chart-page .chart-grid {
  display: grid;
  grid-template-columns: ${isL ? "1fr 1fr" : "1fr"};
  gap: 4mm;
  flex: 1;
  min-height: 0;
}
.chart-card {
  background: ${SECBG};
  border: 1px solid ${GR};
  border-radius: 2.5mm;
  display: flex; flex-direction: column;
  overflow: hidden;
  min-height: 0;
}
.chart-card-header {
  font-size: 10pt; font-weight: 700; color: ${NAVY};
  padding: 3.5mm 5mm 2.5mm;
  border-bottom: 1px solid ${GR};
  letter-spacing: 0.1px; flex-shrink: 0;
}
.chart-svg {
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: 2mm 3mm 1mm;
}

.line-chart-container {
  display: flex; align-items: center; justify-content: center;
  break-inside: avoid; overflow: visible;
  max-height: ${isL ? "110mm" : "130mm"};
  height: ${isL ? "110mm" : "130mm"};
}
.line-chart-svg {
  width: 100%;
  max-height: 100%;
  display: block;
  break-inside: avoid;
}

.fin-table {
  width: 100%; border-collapse: collapse;
  font-size: ${isL ? "11pt" : "10pt"};
  border: 0.6pt solid ${SAGE};
  border-radius: 2mm; overflow: hidden;
}
.fin-table thead { display: table-header-group; }
.fin-table tr { break-inside: avoid; }
.fin-table thead tr {
  background: linear-gradient(135deg, ${SECBG}, ${ALT});
  border-bottom: 2px solid ${DK};
}
.fin-table th {
  color: ${NAVY}; font-weight: 700;
  padding: 2.5mm 3mm; text-align: center;
  font-size: ${isL ? "11pt" : "10pt"};
  letter-spacing: 0.2px; border: none;
}
.fin-table th.tbl-label-hdr {
  text-align: left; min-width: ${isL ? "48mm" : "38mm"};
}
.fin-table td {
  padding: 1.8mm 3mm;
  border-bottom: 1px solid color-mix(in srgb, ${SAGE} 18%, white);
  border-left: 1px solid color-mix(in srgb, ${SAGE} 10%, white);
  border-right: 1px solid color-mix(in srgb, ${SAGE} 10%, white);
}
.fin-table tbody tr:last-child td {
  border-bottom: 2px solid ${SAGE};
}
.fin-table .tbl-label {
  text-align: left; color: ${TXT};
  white-space: nowrap;
  font-size: ${isL ? "11pt" : "10pt"};
}
.fin-table .tbl-val {
  text-align: right;
  font-family: 'Courier New', Courier, monospace;
  white-space: nowrap;
  color: ${TXT}; letter-spacing: 0.2px;
  font-size: ${isL ? "11pt" : "10pt"};
}
.fin-table .row-header td {
  font-weight: 700; background: ${SECBG};
  border-top: 1.5px solid ${SAGE};
  color: ${NAVY};
  letter-spacing: 0.15px;
}
.fin-table .row-total td {
  font-weight: 700;
  border-top: 1.5px solid ${GR};
  color: ${NAVY};
}
.fin-table .row-formula td {
  font-style: italic; color: ${GR};
  font-size: 0.95em;
}
.fin-table .row-stripe td {
  background: ${ALT};
}

.analysis-body { flex: 1; }
.insights-list { margin-bottom: 6mm; }
.insight-block {
  background: ${ALT}; border-left: 3px solid ${DK};
  border-radius: 0 2mm 2mm 0;
  padding: 4mm 5mm; margin-bottom: 3.5mm;
}
.insight-title {
  font-size: 10pt; font-weight: 700; color: ${NAVY};
  margin-bottom: 1.5mm;
}
.insight-text {
  font-size: 9.5pt; line-height: 1.6; color: ${TXT};
}
.insight-text-plain {
  font-size: 9.5pt; line-height: 1.6; color: ${TXT};
  margin-bottom: 3mm;
}
.analysis-highlights-grid {
  display: grid;
  grid-template-columns: repeat(${isL ? 3 : 2}, 1fr);
  gap: 3mm;
}
.analysis-highlight {
  background: linear-gradient(135deg, ${SECBG}, ${ALT});
  border: 1px solid ${GR};
  border-radius: 2mm; padding: 4mm 5mm;
}
.analysis-highlight-label {
  font-size: 7pt; font-weight: 700; color: ${DK};
  letter-spacing: 1px; margin-bottom: 1mm;
}
.analysis-highlight-value {
  font-size: 14pt; font-weight: 700; color: ${NAVY};
  margin-bottom: 1mm;
}
.analysis-highlight-desc {
  font-size: 7pt; color: ${GR}; line-height: 1.3;
}

.empty-state {
  font-size: 11pt; color: ${GR};
  text-align: center; padding: 30mm; flex: 1;
  display: flex; align-items: center; justify-content: center;
}`;
}
