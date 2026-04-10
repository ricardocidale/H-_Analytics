import { logger } from "../logger";

export function repairTruncatedJson(str: string): string {
  let s = str.trim();

  if (s.endsWith(",")) s = s.slice(0, -1);

  let inString = false;
  let escape = false;
  let lastValidPos = s.length;
  const stack: string[] = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}") { if (stack.length && stack[stack.length - 1] === "{") stack.pop(); }
    else if (ch === "]") { if (stack.length && stack[stack.length - 1] === "[") stack.pop(); }
    lastValidPos = i + 1;
  }

  if (inString) {
    const lastQuote = s.lastIndexOf('"');
    if (lastQuote > 0) {
      s = s.substring(0, lastQuote + 1);
    } else {
      s += '"';
    }
  }

  s = s.replace(/,\s*$/, "");
  s = s.replace(/,\s*([\]}])/g, "$1");
  s = s.replace(/"[^"]*":\s*$/m, "");
  s = s.replace(/,\s*$/, "");

  inString = false;
  escape = false;
  const stack2: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack2.push(ch);
    else if (ch === "}") { if (stack2.length && stack2[stack2.length - 1] === "{") stack2.pop(); }
    else if (ch === "]") { if (stack2.length && stack2[stack2.length - 1] === "[") stack2.pop(); }
  }

  while (stack2.length) {
    const open = stack2.pop();
    s += open === "{" ? "}" : "]";
  }

  return s;
}

export function extractJsonFromText(text: string): string {
  let s = text.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  if (firstBrace === -1 && firstBracket === -1) return s;
  const start = firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
  return s.substring(start);
}

export function aggressiveParse(raw: string): any {
  const jsonStr = extractJsonFromText(raw);
  let lastErr: unknown;

  try { return JSON.parse(jsonStr); } catch (e: unknown) { lastErr = e; }

  try { return JSON.parse(repairTruncatedJson(jsonStr)); } catch (e: unknown) { lastErr = e; }

  const lines = jsonStr.split("\n");
  for (let drop = 1; drop <= Math.min(20, lines.length - 1); drop++) {
    const trimmed = lines.slice(0, lines.length - drop).join("\n");
    try { return JSON.parse(repairTruncatedJson(trimmed)); } catch (e: unknown) { lastErr = e; }
  }

  logger.warn(`aggressiveParse exhausted all strategies (input length=${jsonStr.length}): ${lastErr instanceof Error ? lastErr.message : lastErr}`, "export-json");
  throw new Error("Could not parse AI response as JSON after all repair strategies");
}
