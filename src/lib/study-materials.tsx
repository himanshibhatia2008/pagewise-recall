import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import {
  MAX_FILES_PER_BATCH,
  countWords,
  hasPdfSignature,
  judgeExtraction,
  validatePdfMeta,
  type ExtractionVerdict,
  type PageText,
} from "@/lib/pdf/rules";

export type MaterialStatus = "reading" | "extracting" | "ready" | "partial" | "needs-ocr" | "error";

export type StudyMaterial = {
  id: string;
  fileName: string;
  size: number;
  addedAt: number;
  status: MaterialStatus;
  /** 0–100 across reading the file (0–15) and extracting pages (15–100). */
  progress: number;
  pagesDone: number;
  totalPages: number;
  pages: PageText[];
  wordCount: number;
  verdict?: ExtractionVerdict | undefined;
  error?: string | undefined;
};

type Ctx = {
  materials: StudyMaterial[];
  addFiles: (files: File[]) => { rejected: { name: string; reason: string }[] };
  removeMaterial: (id: string) => void;
  retryMaterial: (id: string) => void;
};

const StudyMaterialsContext = createContext<Ctx | null>(null);

function readWithProgress(file: File, onProgress: (fraction: number) => void) {
  const reader = new FileReader();
  const promise = new Promise<ArrayBuffer>((resolve, reject) => {
    reader.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("We couldn't read this file from your device."));
    reader.onabort = () => reject(new Error("Cancelled"));
  });
  reader.readAsArrayBuffer(file);
  return { promise, abort: () => reader.abort() };
}

export function StudyMaterialsProvider({ children }: { children: ReactNode }) {
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const files = useRef(new Map<string, File>());
  const cancels = useRef(new Map<string, () => void>());

  const patch = useCallback((id: string, update: Partial<StudyMaterial>) => {
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...update } : m)));
  }, []);

  const process = useCallback(
    async (id: string) => {
      const file = files.current.get(id);
      if (!file) return;
      let cancelled = false;
      const reading = readWithProgress(file, (f) => patch(id, { progress: Math.round(f * 15) }));
      cancels.current.set(id, () => {
        cancelled = true;
        reading.abort();
      });

      try {
        const buffer = await reading.promise;
        if (cancelled) return;
        if (!hasPdfSignature(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1024)))) {
          patch(id, {
            status: "error",
            error: "This file has a .pdf name but isn't a real PDF inside. Please upload a genuine PDF.",
          });
          return;
        }
        patch(id, { status: "extracting", progress: 15 });

        const { extractPdfText } = await import("@/lib/pdf/extract");
        const handle = extractPdfText(buffer, (done, total) => {
          patch(id, {
            pagesDone: done,
            totalPages: total,
            progress: total ? 15 + Math.round((done / total) * 85) : 15,
          });
        });
        cancels.current.set(id, () => {
          cancelled = true;
          handle.cancel();
        });
        const pages = await handle.promise;
        if (cancelled) return;

        const verdict = judgeExtraction(pages);
        const wordCount = pages.reduce((sum, p) => sum + countWords(p.text), 0);
        if (verdict.kind === "empty") {
          patch(id, { status: "error", progress: 100, error: "This PDF has no pages." });
          return;
        }
        patch(id, {
          status: verdict.kind === "needs-ocr" ? "needs-ocr" : verdict.kind,
          progress: 100,
          pages,
          wordCount,
          verdict,
        });
      } catch (err) {
        if (cancelled) return;
        patch(id, {
          status: "error",
          error: err instanceof Error && err.message !== "Cancelled" ? err.message : "Something went wrong.",
        });
      } finally {
        if (!cancelled) cancels.current.delete(id);
      }
    },
    [patch],
  );

  const addFiles = useCallback<Ctx["addFiles"]>(
    (incoming) => {
      const rejected: { name: string; reason: string }[] = [];
      const accepted: StudyMaterial[] = [];
      incoming.forEach((file, index) => {
        if (index >= MAX_FILES_PER_BATCH) {
          rejected.push({ name: file.name, reason: `You can add up to ${MAX_FILES_PER_BATCH} PDFs at a time.` });
          return;
        }
        const check = validatePdfMeta(file);
        if (!check.ok) {
          rejected.push({ name: file.name, reason: check.reason });
          return;
        }
        const id = crypto.randomUUID();
        files.current.set(id, file);
        accepted.push({
          id,
          fileName: file.name,
          size: file.size,
          addedAt: Date.now(),
          status: "reading",
          progress: 0,
          pagesDone: 0,
          totalPages: 0,
          pages: [],
          wordCount: 0,
        });
      });
      if (accepted.length) {
        setMaterials((prev) => [...accepted, ...prev]);
        accepted.forEach((m) => void process(m.id));
      }
      return { rejected };
    },
    [process],
  );

  const removeMaterial = useCallback((id: string) => {
    cancels.current.get(id)?.();
    cancels.current.delete(id);
    files.current.delete(id);
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const retryMaterial = useCallback(
    (id: string) => {
      patch(id, { status: "reading", progress: 0, pagesDone: 0, totalPages: 0, error: undefined });
      void process(id);
    },
    [patch, process],
  );

  const value = useMemo(
    () => ({ materials, addFiles, removeMaterial, retryMaterial }),
    [materials, addFiles, removeMaterial, retryMaterial],
  );
  return <StudyMaterialsContext.Provider value={value}>{children}</StudyMaterialsContext.Provider>;
}

export function useStudyMaterials() {
  const ctx = useContext(StudyMaterialsContext);
  if (!ctx) throw new Error("useStudyMaterials must be used inside StudyMaterialsProvider");
  return ctx;
}
