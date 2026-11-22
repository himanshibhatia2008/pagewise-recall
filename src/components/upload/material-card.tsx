import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  RotateCcw,
  ScanText,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/pdf/rules";
import type { StudyMaterial } from "@/lib/study-materials";
import { cn } from "@/lib/utils";

function StatusBadge({ m }: { m: StudyMaterial }) {
  const map = {
    reading: { label: "Uploading", cls: "bg-accent text-accent-foreground", Icon: Loader2, spin: true },
    extracting: { label: "Reading pages", cls: "bg-primary-soft text-primary", Icon: Loader2, spin: true },
    ready: { label: "Text extracted", cls: "bg-success-soft text-success", Icon: CheckCircle2, spin: false },
    partial: { label: "Partly readable", cls: "bg-warning-soft text-warning-foreground", Icon: AlertTriangle, spin: false },
    "needs-ocr": { label: "Needs OCR", cls: "bg-warning-soft text-warning-foreground", Icon: ScanText, spin: false },
    error: { label: "Failed", cls: "bg-destructive-soft text-destructive", Icon: XCircle, spin: false },
  } as const;
  const s = map[m.status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", s.cls)}>
      <s.Icon className={cn("size-3.5", s.spin && "animate-spin")} />
      {s.label}
    </span>
  );
}

function progressLabel(m: StudyMaterial) {
  if (m.status === "reading") return `Uploading file… ${Math.round((m.progress / 15) * 100)}%`;
  if (m.totalPages === 0) return "Opening PDF…";
  return `Extracting text — page ${Math.min(m.pagesDone + 1, m.totalPages)} of ${m.totalPages}`;
}

export function MaterialCard({
  material: m,
  onRemove,
  onRetry,
}: {
  material: StudyMaterial;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const busy = m.status === "reading" || m.status === "extracting";
  const hasText = m.status === "ready" || m.status === "partial";

  return (
    <li className="animate-rise overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-start gap-4 p-4 sm:p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold" title={m.fileName}>
              {m.fileName}
            </p>
            <StatusBadge m={m} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatBytes(m.size)}
            {m.totalPages > 0 && ` · ${m.totalPages} ${m.totalPages === 1 ? "page" : "pages"}`}
            {hasText && ` · ${m.wordCount.toLocaleString()} words`}
          </p>

          {busy && (
            <div className="mt-3">
              <Progress value={m.progress} className="h-2 bg-muted" />
              <p className="mt-1.5 text-xs font-medium text-muted-foreground">{progressLabel(m)}</p>
            </div>
          )}

          {m.status === "error" && (
            <p className="mt-3 rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive">{m.error}</p>
          )}

          {m.status === "needs-ocr" && (
            <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2.5 text-sm text-warning-foreground">
              <p className="font-semibold">This looks like a scanned PDF — OCR is required.</p>
              <p className="mt-0.5">
                None of its {m.totalPages} pages contain selectable text, so there's nothing to turn into
                flashcards yet. Try the original digital file, or run it through an OCR tool (for example
                “Save as searchable PDF”) and upload it again.
              </p>
            </div>
          )}

          {m.status === "partial" && m.verdict && (
            <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
              Only {m.verdict.textPages} of {m.verdict.totalPages} pages have readable text. Pages{" "}
              {m.verdict.emptyPages.slice(0, 12).join(", ")}
              {m.verdict.emptyPages.length > 12 && "…"} look scanned and will be skipped unless you add OCR.
            </p>
          )}

          {hasText && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              aria-expanded={open}
            >
              {open ? "Hide extracted text" : "Preview extracted text"}
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {m.status === "error" && (
            <Button variant="ghost" size="icon" onClick={onRetry} aria-label={`Retry ${m.fileName}`}>
              <RotateCcw />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={busy ? `Cancel and remove ${m.fileName}` : `Remove ${m.fileName}`}
            className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
          >
            <X />
          </Button>
        </div>
      </div>

      {open && hasText && (
        <div className="max-h-[28rem] space-y-3 overflow-y-auto border-t border-border bg-muted/50 p-4 sm:p-5">
          {m.pages.map((p) => (
            <article key={p.pageNumber} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Page {p.pageNumber}
              </p>
              {p.text ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{p.text}</p>
              ) : (
                <p className="mt-2 text-sm italic text-muted-foreground">No readable text on this page.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </li>
  );
}
