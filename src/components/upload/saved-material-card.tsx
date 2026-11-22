import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ChevronDown, FileText, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchMaterialPages, keys, type MaterialSummary } from "@/lib/data/queries";
import { formatBytes } from "@/lib/pdf/rules";
import { cn } from "@/lib/utils";

export function SavedMaterialCard({ material: m }: { material: MaterialSummary }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const pages = useQuery({ queryKey: ["material-pages", m.id], queryFn: () => fetchMaterialPages(m.id), enabled: open });

  const remove = async () => {
    setDeleting(true);
    const { error } = await supabase.from("study_materials").delete().eq("id", m.id);
    setDeleting(false);
    if (error) return void toast.error("Couldn't delete this file", { description: error.message });
    toast.success(`Removed ${m.file_name}`);
    void queryClient.invalidateQueries({ queryKey: keys.materials });
  };

  return (
    <li className="animate-rise overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold" title={m.file_name}>{m.file_name}</p>
              {m.status === "ready" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
                  <CheckCircle2 className="size-3.5" /> Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning-foreground">
                  <AlertTriangle className="size-3.5" /> {m.text_page_count} of {m.page_count} pages readable
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatBytes(m.file_size)} · {m.page_count} {m.page_count === 1 ? "page" : "pages"} ·{" "}
              {m.word_count.toLocaleString()} words · added {new Date(m.created_at).toLocaleDateString()}
            </p>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              aria-expanded={open}
            >
              {open ? "Hide extracted text" : "Preview extracted text"}
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:pl-2">
          <Button asChild size="sm" className="rounded-xl">
            <Link to="/smart-revision/generate" search={{ material: m.id }}>
              <Sparkles /> Generate flashcards
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Delete ${m.file_name}`} disabled={deleting} className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive">
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{m.file_name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  The extracted text is removed. Flashcards you already made from it stay in your decks.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {open && (
        <div className="max-h-[28rem] space-y-3 overflow-y-auto border-t border-border bg-muted/50 p-4 sm:p-5">
          {pages.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading text…</p>}
          {pages.error && <p className="text-sm text-destructive">Couldn't load the text. Please try again.</p>}
          {pages.data?.map((p) => (
            <article key={p.pageNumber} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Page {p.pageNumber}</p>
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
