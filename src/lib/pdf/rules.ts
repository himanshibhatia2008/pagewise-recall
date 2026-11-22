// Pure, framework-free rules for accepting PDFs and judging extraction quality.
// Kept separate from the PDF.js code so they can be unit-tested and reused server-side.

export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB per file
export const MAX_FILES_PER_BATCH = 10;
/** A page with fewer readable characters than this is treated as image-only (needs OCR). */
export const MIN_TEXT_CHARS_PER_PAGE = 25;

export type FileLike = { name: string; size: number; type: string };

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validatePdfMeta(file: FileLike): ValidationResult {
  const looksLikePdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return { ok: false, reason: "Only PDF files are supported. Please choose a .pdf file." };
  }
  if (file.size === 0) {
    return { ok: false, reason: "This file is empty (0 bytes)." };
  }
  if (file.size > MAX_PDF_BYTES) {
    return {
      ok: false,
      reason: `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_PDF_BYTES)} per PDF.`,
    };
  }
  return { ok: true };
}

/** Real PDFs start with "%PDF-" within the first 1024 bytes (PDF 1.7 §7.5.2). */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024) - 5;
  for (let i = 0; i <= limit; i++) {
    if (
      bytes[i] === 0x25 && // %
      bytes[i + 1] === 0x50 && // P
      bytes[i + 2] === 0x44 && // D
      bytes[i + 3] === 0x46 && // F
      bytes[i + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
}

export type PageText = { pageNumber: number; text: string };

export type ExtractionVerdict =
  | { kind: "ready"; textPages: number; totalPages: number; emptyPages: number[] }
  | { kind: "partial"; textPages: number; totalPages: number; emptyPages: number[] }
  | { kind: "needs-ocr"; textPages: 0; totalPages: number; emptyPages: number[] }
  | { kind: "empty"; textPages: 0; totalPages: 0; emptyPages: [] };

export function readableChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

export function judgeExtraction(pages: PageText[]): ExtractionVerdict {
  if (pages.length === 0) return { kind: "empty", textPages: 0, totalPages: 0, emptyPages: [] };
  const emptyPages = pages
    .filter((p) => readableChars(p.text) < MIN_TEXT_CHARS_PER_PAGE)
    .map((p) => p.pageNumber);
  const textPages = pages.length - emptyPages.length;
  if (textPages === 0) {
    return { kind: "needs-ocr", textPages: 0, totalPages: pages.length, emptyPages };
  }
  // More than half the pages unreadable usually means a partly scanned document.
  if (emptyPages.length > pages.length / 2) {
    return { kind: "partial", textPages, totalPages: pages.length, emptyPages };
  }
  return { kind: "ready", textPages, totalPages: pages.length, emptyPages };
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}
