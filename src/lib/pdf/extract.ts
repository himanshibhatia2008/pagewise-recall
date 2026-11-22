// Browser-only PDF.js text extraction. Import this module dynamically from event
// handlers so PDF.js never loads during SSR.
import type { PageText } from "./rules";

export class PdfExtractionError extends Error {
  constructor(
    message: string,
    public code: "password" | "invalid" | "cancelled" | "unknown",
  ) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

export type ExtractionHandle = {
  promise: Promise<PageText[]>;
  cancel: () => void;
};

type TextItemLike = { str: string; hasEOL: boolean; transform: number[]; width: number; height: number };

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | undefined;

async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [pdfjs, worker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/** Rebuild readable lines from positioned text runs, inserting spaces at visual gaps. */
function itemsToText(items: TextItemLike[]): string {
  let out = "";
  let prevEndX: number | null = null;
  for (const item of items) {
    const x = item.transform[4] ?? 0;
    const fontSize = Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0) || item.height || 10;
    if (prevEndX !== null && item.str && !/\s$/.test(out) && !/^\s/.test(item.str)) {
      if (x - prevEndX > fontSize * 0.15) out += " ";
    }
    out += item.str;
    if (item.hasEOL) {
      out += "\n";
      prevEndX = null;
    } else {
      prevEndX = x + item.width;
    }
  }
  return out
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractPdfText(
  data: ArrayBuffer,
  onPage: (done: number, total: number) => void,
): ExtractionHandle {
  let cancelled = false;
  let destroy: (() => void) | undefined;

  const promise = (async () => {
    const pdfjs = await loadPdfJs();
    if (cancelled) throw new PdfExtractionError("Cancelled", "cancelled");
    const task = pdfjs.getDocument({ data: new Uint8Array(data) });
    destroy = () => void task.destroy();

    let doc;
    try {
      doc = await task.promise;
    } catch (err) {
      if (cancelled) throw new PdfExtractionError("Cancelled", "cancelled");
      const name = (err as { name?: string })?.name;
      if (name === "PasswordException") {
        throw new PdfExtractionError(
          "This PDF is password-protected. Remove the password and upload it again.",
          "password",
        );
      }
      if (name === "InvalidPDFException") {
        throw new PdfExtractionError(
          "This file is damaged or not a valid PDF, so its text can't be read.",
          "invalid",
        );
      }
      throw new PdfExtractionError("We couldn't open this PDF. Please try another file.", "unknown");
    }

    const pages: PageText[] = [];
    onPage(0, doc.numPages);
    for (let n = 1; n <= doc.numPages; n++) {
      if (cancelled) throw new PdfExtractionError("Cancelled", "cancelled");
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = content.items.filter((i) => "str" in i) as unknown as TextItemLike[];
      pages.push({ pageNumber: n, text: itemsToText(items) });
      page.cleanup();
      onPage(n, doc.numPages);
    }
    await doc.loadingTask.destroy();
    return pages;
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      destroy?.();
    },
  };
}
