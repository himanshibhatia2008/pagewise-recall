import { FileUp, UploadCloud } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { MAX_FILES_PER_BATCH, MAX_PDF_BYTES, formatBytes } from "@/lib/pdf/rules";
import { cn } from "@/lib/utils";

export function PdfDropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload PDF files"
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-card px-6 py-12 text-center shadow-soft outline-none transition-all focus-visible:ring-4 focus-visible:ring-ring/30",
        dragging ? "scale-[1.01] border-primary bg-primary-soft" : "border-input hover:border-primary/50 hover:bg-primary-soft/40",
      )}
    >
      <span
        className={cn(
          "flex size-16 items-center justify-center rounded-2xl bg-hero text-primary-foreground shadow-lift transition-transform",
          dragging ? "scale-110" : "group-hover:-translate-y-1",
        )}
      >
        <UploadCloud className="size-8" />
      </span>
      <p className="mt-5 font-display text-xl font-semibold">
        {dragging ? "Drop your PDFs here" : "Drag & drop your PDF notes"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        or <span className="font-semibold text-primary underline-offset-4 group-hover:underline">browse your device</span>
      </p>
      <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        <FileUp className="size-3.5" /> PDF only · up to {formatBytes(MAX_PDF_BYTES)} each · {MAX_FILES_PER_BATCH} files at a time
      </p>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
