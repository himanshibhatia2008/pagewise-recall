import { Link, createFileRoute } from "@tanstack/react-router";
import { Layers, Loader2, Plus, Sparkles } from "lucide-react";
import { useMemo } from "react";

import { DeckFormDialog } from "@/components/revision/deck-form-dialog";
import { EmptyState, PageHeader } from "@/components/revision/page-header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStudyData } from "@/lib/data/queries";
import { deckStats, emptyDeckStats } from "@/lib/deck-stats";

export const Route = createFileRoute("/_authenticated/smart-revision/decks/")({
  head: () => ({
    meta: [
      { title: "My decks — StudyMate AI" },
      { name: "description", content: "Your flashcard decks organised by subject and unit, with cards due and mastered." },
      { property: "og:title", content: "My decks — StudyMate AI" },
      { property: "og:description", content: "Your flashcard decks organised by subject and unit, with cards due and mastered." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DecksPage,
});

function DecksPage() {
  const { decks, cards, isLoading, error } = useStudyData();
  const stats = useMemo(() => deckStats(cards, new Date()), [cards]);
  const groups = useMemo(() => {
    const g = new Map<string, typeof decks>();
    for (const d of decks) {
      const key = d.subject?.trim() || "Other";
      g.set(key, [...(g.get(key) ?? []), d]);
    }
    return [...g.entries()].sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  }, [decks]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Smart Revision"
        title="My decks"
        description="Keep separate decks for each subject and unit."
        actions={
          <>
            <Button asChild variant="outline" className="rounded-xl"><Link to="/smart-revision/generate"><Sparkles /> Generate cards</Link></Button>
            <DeckFormDialog trigger={<Button className="rounded-xl"><Plus /> New deck</Button>} />
          </>
        }
      />

      {isLoading ? (
        <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading decks…</p>
      ) : error ? (
        <p className="rounded-xl bg-destructive-soft px-4 py-3 text-sm text-destructive">Couldn't load your decks. Refresh to try again.</p>
      ) : decks.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-6" />}
          title="No decks yet"
          body="Generate flashcards from a PDF and save them into a deck, or create an empty deck to start."
          action={<Button asChild className="rounded-xl"><Link to="/smart-revision/generate"><Sparkles /> Generate flashcards</Link></Button>}
        />
      ) : (
        groups.map(([subject, list]) => (
          <section key={subject} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">{subject}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((d) => {
                const s = stats.get(d.id) ?? emptyDeckStats;
                const pct = s.total ? Math.round((s.mastered / s.total) * 100) : 0;
                return (
                  <li key={d.id}>
                    <Link
                      to="/smart-revision/decks/$deckId"
                      params={{ deckId: d.id }}
                      className="animate-rise group flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-display text-lg font-semibold">{d.name}</p>
                          <p className="text-sm text-muted-foreground">{[d.subject, d.unit].filter(Boolean).join(" · ") || "No subject"}</p>
                        </div>
                        {s.due > 0 && <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">{s.due} due</span>}
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-muted py-2"><p className="font-display text-xl font-bold">{s.total}</p><p className="text-[11px] text-muted-foreground">cards</p></div>
                        <div className="rounded-xl bg-sky-soft py-2"><p className="font-display text-xl font-bold text-sky">{s.newCount}</p><p className="text-[11px] text-muted-foreground">new</p></div>
                        <div className="rounded-xl bg-success-soft py-2"><p className="font-display text-xl font-bold text-success">{s.mastered}</p><p className="text-[11px] text-muted-foreground">mastered</p></div>
                      </div>
                      <div className="mt-4">
                        <Progress value={pct} className="h-1.5 bg-muted" />
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {pct}% mastered{s.nextDue && s.due === 0 ? ` · next review ${new Date(s.nextDue).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
