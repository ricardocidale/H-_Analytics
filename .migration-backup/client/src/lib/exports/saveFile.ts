const MIME_TYPES: Record<string, string> = {
  ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const FILE_TYPE_DESCRIPTIONS: Record<string, string> = {
  ".csv": "CSV Spreadsheet",
  ".xlsx": "Excel Workbook",
  ".pptx": "PowerPoint Presentation",
  ".pdf": "PDF Document",
  ".png": "PNG Image",
  ".docx": "Word Document",
};

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.substring(dot).toLowerCase() : "";
}

function isRealBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.document !== "undefined" && typeof navigator !== "undefined";
}

function triggerDownload(blob: Blob, suggestedName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 250);
}

export async function saveFile(blob: Blob, suggestedName: string): Promise<void> {
  const ext = getExtension(suggestedName);

  if (isRealBrowser() && "showSaveFilePicker" in window) {
    try {
      const handle = await (window as unknown as { showSaveFilePicker: (options: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: FILE_TYPE_DESCRIPTIONS[ext] || "File",
            accept: { [MIME_TYPES[ext] || "application/octet-stream"]: [ext] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
    }
  }

  triggerDownload(blob, suggestedName);
}

export async function saveDataUrl(dataUrl: string, suggestedName: string): Promise<void> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  await saveFile(blob, suggestedName);
}
