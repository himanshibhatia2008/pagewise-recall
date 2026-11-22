import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Info, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MaterialCard } from "@/components/upload/material-card";
import { PdfDropzone } from "@/components/upload/pdf-dropzone";
import { SavedMaterialCard } from "@/components/upload/saved-material-card";
import { materialsQuery } from "@/lib/data/queries";
import { useStudyMaterials } from "@/lib/study-materials";

export const Route = createFileRoute("/_authenticated/smart-revision/upload")({
  head: () => ({
    meta: [
      { title: "Upload PDF notes — StudyMate AI" },
      { name: "description", content: "Upload PDF notes and extract their text page by page, ready for AI flashcards." },
      { property: "og:title", content: "Upload PDF notes — StudyMate AI" },
      { property: "og:description", content: "Upload PDF notes and extract their text page by page, ready for AI flashcards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const { materials: inProgress, addFiles, removeMaterial, retryMaterial } = useStudyMaterials();
  const saved = useQuery(materialsQuery);
  const library = saved.data ?? [];
  const totalPages = library.reduce((s, m) => s + m.text_page_count, 0);

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
          We read every page and pull out the actual text — that's what your flashcards will be built from.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <PdfDropzone onFiles={handleFiles} />

          {inProgress.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Processing</h2>
              <ul className="flex flex-col gap-3">
                {inProgress.map((m) => (
                  <MaterialCard key={m.id} material={m} onRemove={() => removeMaterial(m.id)} onRetry={() => retryMaterial(m.id)} />
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold">
              Your study materials <span className="text-muted-foreground">({library.length})</span>
            </h2>
            {saved.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading your files…</p>
            ) : saved.error ? (
              <p className="rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive">Couldn't load your files. Refresh to try again.</p>
            ) : library.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No saved files yet. PDFs appear here once their text is extracted.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {library.map((m) => <SavedMaterialCard key={m.id} material={m} />)}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <h2 className="font-semibold">Next: flashcards</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {library.length > 0
                ? `${library.length} ${library.length === 1 ? "file" : "files"} with ${totalPages} readable pages ready.`
                : "Once a file's text is extracted, it's ready for AI flashcard generation."}
            </p>
            {library.length > 0 ? (
              <Button asChild className="mt-4 w-full rounded-xl">
                <Link to="/smart-revision/generate">Generate flashcards</Link>
              </Button>
            ) : (
              <Button className="mt-4 w-full rounded-xl" disabled>Generate flashcards</Button>
            )}
          </div>

          <div className="rounded-2xl bg-primary-soft p-5 text-sm">
            <div className="flex items-center gap-2 font-semibold text-secondary-foreground">
              <ShieldCheck className="size-4" /> Private by design
            </div>
            <p className="mt-1.5 text-muted-foreground">
              Your PDFs are read inside your browser. Only the extracted text is saved, and only you can see it.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 text-sm shadow-soft">
            <div className="flex items-center gap-2 font-semibold">
              <Info className="size-4 text-sky" /> Tips for best results
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
              <li>Use digital PDFs (exported from Word, Google Docs or slides).</li>
              <li>Photos or scans of pages need OCR before their text can be read.</li>
              <li>Up to 20 MB per PDF, 10 files at a time.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
