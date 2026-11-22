import { createFileRoute } from "@tanstack/react-router";
import { Info, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MaterialCard } from "@/components/upload/material-card";
import { PdfDropzone } from "@/components/upload/pdf-dropzone";
import { useStudyMaterials } from "@/lib/study-materials";

export const Route = createFileRoute("/smart-revision/upload")({
  head: () => ({
    meta: [
      { title: "Upload PDF notes — StudyMate AI" },
      {
        name: "description",
        content: "Upload PDF notes and extract their text page by page, ready for AI flashcards.",
      },
      { property: "og:title", content: "Upload PDF notes — StudyMate AI" },
      {
        property: "og:description",
        content: "Upload PDF notes and extract their text page by page, ready for AI flashcards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const { materials, addFiles, removeMaterial, retryMaterial } = useStudyMaterials();
  const ready = materials.filter((m) => m.status === "ready" || m.status === "partial");
  const totalPages = ready.reduce((s, m) => s + (m.verdict?.textPages ?? 0), 0);

  const handleFiles = (files: File[]) => {
    const { rejected } = addFiles(files);
    rejected.forEach((r) => toast.error(r.name, { description: r.reason }));
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="animate-rise">
        <p className="text-sm font-semibold text-primary">Smart Revision · Step 1</p>
        <h1 className="mt-1 text-3xl font-bold">Upload your PDF notes</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          We read every page and pull out the actual text — that's what your flashcards will be built
          from.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <PdfDropzone onFiles={handleFiles} />

          {materials.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-semibold">
                Your files <span className="text-muted-foreground">({materials.length})</span>
              </h2>
              <ul className="flex flex-col gap-3">
                {materials.map((m) => (
                  <MaterialCard
                    key={m.id}
                    material={m}
                    onRemove={() => removeMaterial(m.id)}
                    onRetry={() => retryMaterial(m.id)}
                  />
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              No files yet. Your uploaded PDFs will appear here.
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <h2 className="font-semibold">Next: flashcards</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {ready.length > 0
                ? `${ready.length} ${ready.length === 1 ? "file" : "files"} with ${totalPages} readable pages ready.`
                : "Once a file's text is extracted, it will be ready for AI flashcard generation."}
            </p>
            <Button className="mt-4 w-full rounded-xl" disabled>
              Generate flashcards
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">AI generation is the next step being built.</p>
          </div>

          <div className="rounded-2xl bg-primary-soft p-5 text-sm">
            <div className="flex items-center gap-2 font-semibold text-secondary-foreground">
              <ShieldCheck className="size-4" /> Private by design
            </div>
            <p className="mt-1.5 text-muted-foreground">
              Your PDFs are read inside your browser. Nothing is uploaded to a server at this step.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 text-sm shadow-soft">
            <div className="flex items-center gap-2 font-semibold">
              <Info className="size-4 text-sky" /> Tips for best results
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
              <li>Use digital PDFs (exported from Word, Google Docs or slides).</li>
              <li>Photos or scans of pages need OCR before their text can be read.</li>
              <li>Notes stay on this page until you refresh.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
