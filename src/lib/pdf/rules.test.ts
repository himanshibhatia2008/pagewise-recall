import { describe, expect, it } from "vitest";

import {
  MAX_PDF_BYTES,
  hasPdfSignature,
  judgeExtraction,
  validatePdfMeta,
} from "./rules";

const enc = (s: string) => new TextEncoder().encode(s);
const longText = "Photosynthesis converts light energy into chemical energy in plants.";

describe("PDF file validation", () => {
  it("rejects files that are not PDFs", () => {
    expect(validatePdfMeta({ name: "notes.docx", size: 1000, type: "application/msword" }).ok).toBe(
      false,
    );
  });

  it("rejects PDFs larger than 20 MB", () => {
    expect(MAX_PDF_BYTES).toBe(20 * 1024 * 1024);
    expect(validatePdfMeta({ name: "big.pdf", size: MAX_PDF_BYTES + 1, type: "application/pdf" }).ok).toBe(false);
    expect(validatePdfMeta({ name: "ok.pdf", size: MAX_PDF_BYTES, type: "application/pdf" }).ok).toBe(true);
  });

  it("rejects empty files", () => {
    expect(validatePdfMeta({ name: "empty.pdf", size: 0, type: "application/pdf" }).ok).toBe(false);
  });

  it("only trusts files whose bytes carry the %PDF- signature", () => {
    expect(hasPdfSignature(enc("%PDF-1.7\n..."))).toBe(true);
    expect(hasPdfSignature(enc("PK\u0003\u0004 renamed zip"))).toBe(false);
  });
});

describe("Extraction verdict", () => {
  it("flags a PDF with no readable text on any page as needing OCR", () => {
    const verdict = judgeExtraction([
      { pageNumber: 1, text: "" },
      { pageNumber: 2, text: "  12 " },
    ]);
    expect(verdict.kind).toBe("needs-ocr");
  });

  it("treats a PDF with zero pages as empty", () => {
    expect(judgeExtraction([]).kind).toBe("empty");
  });

  it("marks a mostly-scanned PDF as partial and lists unreadable pages", () => {
    const verdict = judgeExtraction([
      { pageNumber: 1, text: longText },
      { pageNumber: 2, text: "" },
      { pageNumber: 3, text: "" },
    ]);
    expect(verdict.kind).toBe("partial");
    expect(verdict.emptyPages).toEqual([2, 3]);
  });

  it("accepts a text PDF as ready", () => {
    const verdict = judgeExtraction([
      { pageNumber: 1, text: longText },
      { pageNumber: 2, text: longText },
    ]);
    expect(verdict.kind).toBe("ready");
    expect(verdict.textPages).toBe(2);
  });
});
