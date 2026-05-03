function collectStyles(): string {
  const sheets: string[] = [];
  for (let i = 0; i < document.styleSheets.length; i++) {
    try {
      const sheet = document.styleSheets[i];
      const rules = sheet.cssRules || sheet.rules;
      if (!rules) continue;
      for (let j = 0; j < rules.length; j++) {
        sheets.push(rules[j].cssText);
      }
    } catch {
      if (document.styleSheets[i].href) {
        sheets.push(`@import url("${document.styleSheets[i].href}");`);
      }
    }
  }
  return sheets.join("\n");
}

function inlineComputedStyles(clone: HTMLElement, original: HTMLElement): void {
  const computed = window.getComputedStyle(original);
  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i];
    clone.style.setProperty(prop, computed.getPropertyValue(prop));
  }
  const origChildren = original.children;
  const cloneChildren = clone.children;
  for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
    if (
      origChildren[i] instanceof HTMLElement &&
      cloneChildren[i] instanceof HTMLElement
    ) {
      inlineComputedStyles(
        cloneChildren[i] as HTMLElement,
        origChildren[i] as HTMLElement
      );
    }
  }
}

function serializeElement(
  element: HTMLElement,
  options: CaptureOptions
): string {
  const clone = element.cloneNode(true) as HTMLElement;
  inlineComputedStyles(clone, element);

  const bg = options.bgcolor || "#ffffff";
  const width = options.width
    ? options.width / (options.scale || 2)
    : element.scrollWidth;
  const height = options.height
    ? options.height / (options.scale || 2)
    : element.scrollHeight;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: ${bg}; width: ${width}px; height: ${height}px; overflow: hidden; }
${collectStyles()}
</style>
</head>
<body>${clone.outerHTML}</body>
</html>`;
}

interface CaptureOptions {
  bgcolor?: string;
  quality?: number;
  width?: number;
  height?: number;
  scale?: number;
  style?: Record<string, string>;
}

export async function captureToPng(
  element: HTMLElement,
  options: CaptureOptions = {}
): Promise<string> {
  const scale = options.scale ?? 2;
  const width = options.width
    ? Math.round(options.width / scale)
    : element.scrollWidth;
  const height = options.height
    ? Math.round(options.height / scale)
    : element.scrollHeight;

  const html = serializeElement(element, options);

  const response = await fetch("/api/render/png", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ html, width, height, scale }),
  });

  if (!response.ok) {
    throw new Error(`Server PNG render failed: ${response.status}`);
  }

  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
