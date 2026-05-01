import { captureToPng } from './domCapture';
import { saveDataUrl } from './saveFile';
import { BRAND } from './exportStyles';

const DEFAULT_BG = `#${BRAND.BACKGROUND_HEX}`;
const EXPORT_BORDER = `#${BRAND.BORDER_HEX}`;

interface TablePNGOptions {
  element: HTMLElement;
  filename: string;
  scale?: number;
  collapseAccordions?: boolean;
  bgColor?: string;
}

export async function exportTablePNG(options: TablePNGOptions): Promise<void> {
  const { element, filename, scale = 2, collapseAccordions = true, bgColor = DEFAULT_BG } = options;

  const hiddenRows: HTMLElement[] = [];

  try {
    if (collapseAccordions) {
      const expandableRows = element.querySelectorAll<HTMLElement>('[data-expandable-row="true"]');
      expandableRows.forEach(row => {
        if (row.style.display !== 'none') {
          hiddenRows.push(row);
          row.style.display = 'none';
        }
      });
    }

    element.style.border = 'none';
    const cells = element.querySelectorAll<HTMLElement>('td, th');
    const originalStyles: string[] = [];
    cells.forEach(cell => {
      originalStyles.push(cell.style.cssText);
      cell.style.border = 'none';
      cell.style.borderBottom = `1px solid ${EXPORT_BORDER}`;
    });

    const dataUrl = await captureToPng(element, {
      bgcolor: bgColor,
      quality: 1,
      scale,
      width: element.scrollWidth * scale,
      height: element.scrollHeight * scale,
    });

    cells.forEach((cell, i) => {
      cell.style.cssText = originalStyles[i];
    });
    element.style.border = '';

    await saveDataUrl(dataUrl, filename);
  } catch (error: unknown) {
    console.error('Error exporting table as PNG:', error);
  } finally {
    hiddenRows.forEach(row => {
      row.style.display = '';
    });
  }
}

interface ChartPNGOptions {
  element: HTMLElement;
  filename: string;
  width?: number;
  height?: number;
  scale?: number;
  bgColor?: string;
}

export async function exportChartPNG(options: ChartPNGOptions): Promise<void> {
  const { element, filename, width, height, scale = 2, bgColor = DEFAULT_BG } = options;

  try {
    const dataUrl = await captureToPng(element, {
      bgcolor: bgColor,
      quality: 1,
      scale,
      width: width ?? element.offsetWidth * scale,
      height: height ?? element.offsetHeight * scale,
    });

    await saveDataUrl(dataUrl, filename);
  } catch (error: unknown) {
    console.error('Error exporting chart as PNG:', error);
  }
}

export async function captureChartAsImage(containerRef: HTMLDivElement, bgColor = DEFAULT_BG): Promise<string | null> {
  try {
    return await captureToPng(containerRef, {
      bgcolor: bgColor,
      quality: 1,
      scale: 2,
      width: containerRef.offsetWidth * 2,
      height: containerRef.offsetHeight * 2,
    });
  } catch (error: unknown) {
    console.error('Error capturing chart:', error);

    try {
      const svg = containerRef.querySelector('svg');
      if (!svg) return null;

      const clonedSvg = svg.cloneNode(true) as SVGElement;
      const rect = svg.getBoundingClientRect();
      clonedSvg.setAttribute('width', String(rect.width));
      clonedSvg.setAttribute('height', String(rect.height));

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clonedSvg);
      const encodedData = btoa(unescape(encodeURIComponent(svgString)));
      const dataUri = `data:image/svg+xml;base64,${encodedData}`;

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = rect.width * 2;
          canvas.height = rect.height * 2;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.scale(2, 2);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } else {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = dataUri;
      });
    } catch (fallbackError: unknown) {
      console.error('Fallback also failed:', fallbackError);
      return null;
    }
  }
}
