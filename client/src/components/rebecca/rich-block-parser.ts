export type RichBlockType = "stat" | "compare" | "timeline" | "insight" | "kpi";

export interface StatBlockData {
  type: "stat";
  value: string;
  label: string;
  delta?: string;
  source?: string;
}

export interface CompareColumn {
  header: string;
  rows: Record<string, string>;
}

export interface CompareBlockData {
  type: "compare";
  title?: string;
  columns: CompareColumn[];
}

export interface TimelinePhase {
  label: string;
  date?: string;
  detail?: string;
}

export interface TimelineBlockData {
  type: "timeline";
  title?: string;
  phases: TimelinePhase[];
}

export interface InsightBlockData {
  type: "insight";
  text: string;
  source?: string;
}

export interface KpiMetric {
  label: string;
  value: string;
  delta?: string;
}

export interface KpiBlockData {
  type: "kpi";
  title?: string;
  metrics: KpiMetric[];
}

export type RichBlockData =
  | StatBlockData
  | CompareBlockData
  | TimelineBlockData
  | InsightBlockData
  | KpiBlockData;

export interface MarkdownNode {
  type: "markdown";
  content: string;
}

export interface RichBlockNode {
  type: "richblock";
  block: RichBlockData;
}

export type ContentNode = MarkdownNode | RichBlockNode;

const BLOCK_REGEX = /:::(\w+)\s*\n([\s\S]*?):::/g;
const FENCED_CODE_REGEX = /```[\s\S]*?```/g;

function maskFencedCode(text: string): { masked: string; segments: string[] } {
  const segments: string[] = [];
  const masked = text.replace(FENCED_CODE_REGEX, (match) => {
    segments.push(match);
    return `\x00FENCED${segments.length - 1}\x00`;
  });
  return { masked, segments };
}

function unmaskFencedCode(text: string, segments: string[]): string {
  return text.replace(/\x00FENCED(\d+)\x00/g, (_, idx) => segments[parseInt(idx)] ?? "");
}

function parseKeyValueLines(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const val = trimmed.slice(colonIdx + 1).trim();
      if (key && val) result[key] = val;
    }
  }
  return result;
}

function parseStat(body: string): StatBlockData | null {
  const kv = parseKeyValueLines(body);
  if (!kv.value && !kv.label) return null;
  return {
    type: "stat",
    value: kv.value ?? "",
    label: kv.label ?? "",
    delta: kv.delta || kv.change,
    source: kv.source,
  };
}

function parseCompare(body: string): CompareBlockData | null {
  const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
  let title: string | undefined;
  const columnHeaders: string[] = [];
  const rows: { metric: string; values: string[] }[] = [];

  for (const line of lines) {
    if (line.toLowerCase().startsWith("title:")) {
      title = line.slice(6).trim();
      continue;
    }
    if (line.includes("|")) {
      const cells = line.split("|").map(c => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      if (line.match(/^[\s|:-]+$/)) continue;
      if (columnHeaders.length === 0) {
        columnHeaders.push(...cells);
      } else {
        rows.push({ metric: cells[0], values: cells.slice(1) });
      }
    }
  }

  if (columnHeaders.length < 2 || rows.length === 0) return null;

  const columns: CompareColumn[] = columnHeaders.slice(1).map((header, i) => {
    const rowMap: Record<string, string> = {};
    for (const row of rows) {
      rowMap[row.metric] = row.values[i] ?? "";
    }
    return { header, rows: rowMap };
  });

  return { type: "compare", title, columns };
}

function parseTimeline(body: string): TimelineBlockData | null {
  const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
  let title: string | undefined;
  const phases: TimelinePhase[] = [];

  for (const line of lines) {
    if (line.toLowerCase().startsWith("title:")) {
      title = line.slice(6).trim();
      continue;
    }
    const dashMatch = line.match(/^[-•]\s*(.+)/);
    if (dashMatch) {
      const content = dashMatch[1];
      const pipeIdx = content.indexOf("|");
      if (pipeIdx > 0) {
        const label = content.slice(0, pipeIdx).trim();
        const rest = content.slice(pipeIdx + 1).trim();
        const detailIdx = rest.indexOf("|");
        if (detailIdx > 0) {
          phases.push({
            label,
            date: rest.slice(0, detailIdx).trim(),
            detail: rest.slice(detailIdx + 1).trim(),
          });
        } else {
          phases.push({ label, date: rest });
        }
      } else {
        phases.push({ label: content });
      }
    }
  }

  if (phases.length === 0) return null;
  return { type: "timeline", title, phases };
}

function parseInsight(body: string): InsightBlockData | null {
  const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
  let text = "";
  let source: string | undefined;

  for (const line of lines) {
    if (line.toLowerCase().startsWith("source:")) {
      source = line.slice(7).trim();
    } else {
      text += (text ? " " : "") + line;
    }
  }

  if (!text) return null;
  return { type: "insight", text, source };
}

function parseKpi(body: string): KpiBlockData | null {
  const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
  let title: string | undefined;
  const metrics: KpiMetric[] = [];

  for (const line of lines) {
    if (line.toLowerCase().startsWith("title:")) {
      title = line.slice(6).trim();
      continue;
    }
    const pipeSegments = line.split("|").map(s => s.trim()).filter(Boolean);
    if (pipeSegments.length >= 2) {
      metrics.push({
        label: pipeSegments[0],
        value: pipeSegments[1],
        delta: pipeSegments[2],
      });
    } else {
      const kv = parseKeyValueLines(line);
      if (kv.label || kv.value) {
        metrics.push({
          label: kv.label ?? "",
          value: kv.value ?? "",
          delta: kv.delta,
        });
      }
    }
  }

  if (metrics.length === 0) return null;
  return { type: "kpi", title, metrics };
}

function parseBlock(blockType: string, body: string): RichBlockData | null {
  switch (blockType) {
    case "stat": return parseStat(body);
    case "compare": return parseCompare(body);
    case "timeline": return parseTimeline(body);
    case "insight": return parseInsight(body);
    case "kpi": return parseKpi(body);
    default: return null;
  }
}

export function parseRichBlocks(text: string): ContentNode[] {
  const { masked, segments } = maskFencedCode(text);
  const nodes: ContentNode[] = [];
  let lastIndex = 0;

  BLOCK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = BLOCK_REGEX.exec(masked)) !== null) {
    if (match.index > lastIndex) {
      const md = unmaskFencedCode(masked.slice(lastIndex, match.index).trim(), segments);
      if (md) nodes.push({ type: "markdown", content: md });
    }

    const blockType = match[1].toLowerCase();
    const body = match[2];
    const parsed = parseBlock(blockType, body);

    if (parsed) {
      nodes.push({ type: "richblock", block: parsed });
    } else {
      const raw = unmaskFencedCode(match[0], segments);
      nodes.push({ type: "markdown", content: raw });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < masked.length) {
    const remaining = unmaskFencedCode(masked.slice(lastIndex).trim(), segments);
    if (remaining) nodes.push({ type: "markdown", content: remaining });
  }

  if (nodes.length === 0 && text.trim()) {
    nodes.push({ type: "markdown", content: text });
  }

  return nodes;
}
