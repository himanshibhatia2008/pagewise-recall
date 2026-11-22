import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FastForward, Loader2, Pencil, Play, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { CardRow } from "@/components/revision/card-row";
import { DeckFormDialog } from "@/components/revision/deck-form-dialog";
import { EmptyState, StatTile } from "@/components/revision/page-header";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { keys, useStudyData } from "@/lib/data/queries";
import { deckStats, emptyDeckStats } from "@/lib/deck-stats";
import { buildDueQueue } from "@/lib/srs/queue";

export const Route = createFileRoute("/_authenticated/smart-revision/decks/")({
  head: () => ({
    meta: [
      { title: "Deck — StudyMate AI" },
      { name: "description", content: "Browse, edit and revise the flashcards in this deck." },
      { property: "og:title", content: "Deck — StudyMate AI" },
      { property: "og:description", content: "Browse, edit and revise the flashcards in this deck." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeckPage,
});

function AddCardDialog({ deckId, subject }: { deckId: string; subject: string | null }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) return void toast.error("Add both a question and an answer.");
    setBusy(true);
    const { error } = await supabase.from("flashcards").insert({ deck_id: deckId, question: question.trim(), answer: answer.trim(), subject });
    setBusy(false);
    if (error) return void toast.error("Couldn't add card", { description: error.message });
    await queryClient.invalidateQueries({ queryKey: keys.cards });
    toast.success("Card added");
    setQuestion("");
    setAnswer("");
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="rounded-xl"><Plus /> Add card</Button></DialogTrigger>
      <DialogContent className="rounded-3xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader><DialogTitle>Add a card</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-1.5"><Label htmlFor="new-q">Question</Label><Textarea id="new-q" value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="new-a">Answer</Label><Textarea id="new-a" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} /></div>
          <DialogFooter><Button type="submit" disabled={busy} className="rounded-xl">{busy && <Loader2 className="animate-spin" />} Add card</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeckPage() {
  const { deckId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { decks, cards, logs, isLoading } = useStudyData();
  const [query, setQuery] = useState("");
  const deck = decks.find((d) => d.id === deckId);
  const deckCards = useMemo(() => cards.filter((c) => c.deck_id === deckId), [cards, deckId]);
  const now = new Date();
  const s = deckStats(deckCards, now).get(deckId) ?? emptyDeckStats;
  const sessionSize = buildDueQueue(deckCards, logs, now).length;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deckCards;
    return deckCards.filter((c) => [c.question, c.answer, c.topic ?? ""].some((t) => t.toLowerCase().includes(q)));
  }, [deckCards, query]);

  const removeDeck = async () => {
    const { error } = await supabase.from("decks").delete().eq("id", deckId);
    if (error) return void toast.error("Couldn't delete deck", { description: error.message });
    await Promise.all([keys.decks, keys.cards, keys.logs].map((k) => queryClient.invalidateQueries({ queryKey: k })));
    toast.success("Deck deleted");
    void navigate({ to: "/smart-revision/decks" });
  };

  if (isLoading) return <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading deck…</p>;
  if (!deck) {
    return (
      <EmptyState icon={<Search className="size-6" />} title="Deck not found" body="It may have been deleted."
        action={<Button asChild className="rounded-xl"><Link to="/smart-revision/decks">Back to my decks</Link></Button>} />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-rise">
        <Link to="/smart-revision/decks" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> My decks</Link>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">{[deck.subject, deck.unit].filter(Boolean).join(" · ") || "Deck"}</p>
            <h1 className="mt-1 text-3xl font-bold">{deck.name}</h1>
            {deck.description && <p className="mt-2 max-w-2xl text-muted-foreground">{deck.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <DeckFormDialog deck={deck} trigger={<Button variant="ghost" size="icon" aria-label="Edit deck"><Pencil /></Button>} />
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Delete deck" className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"><Trash2 /></Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{deck.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>This permanently deletes its {s.total} cards and their review history.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={removeDeck}>Delete deck</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Cards" value={s.total} icon={<Sparkles className="size-5" />} />
        <StatTile label="Due now" value={s.due} icon={<Play className="size-5" />} tone="accent" />
        <StatTile label="New" value={s.newCount} icon={<Plus className="size-5" />} tone="sky" />
        <StatTile label="Mastered" value={s.mastered} hint={s.total ? `${Math.round((s.mastered / s.total) * 100)}% of deck` : undefined} icon={<Sparkles className="size-5" />} tone="success" />
      </div>

      <div className="flex flex-wrap gap-2">
        {sessionSize > 0 ? (
          <Button asChild size="lg" className="rounded-xl font-semibold">
            <Link to="/smart-revision/review" search={{ deck: deckId, mode: "due" }}><Play /> Revise now ({sessionSize})</Link>
          </Button>
        ) : (
          <Button size="lg" className="rounded-xl" disabled><Play /> Nothing due</Button>
        )}
        {s.total > 0 && (
          <Button asChild size="lg" variant="outline" className="rounded-xl">
            <Link to="/smart-revision/review" search={{ deck: deckId, mode: "early" }}><FastForward /> Study early</Link>
          </Button>
        )}
        <Button asChild size="lg" variant="outline" className="rounded-xl">
          <Link to="/smart-revision/generate" search={{ deck: deckId }}><Sparkles /> Generate more</Link>
        </Button>
        <AddCardDialog deckId={deckId} subject={deck.subject} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Cards <span className="text-muted-foreground">({deckCards.length})</span></h2>
          {deckCards.length > 0 && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards" className="rounded-xl pl-9" aria-label="Search cards" />
            </div>
          )}
        </div>
        {deckCards.length === 0 ? (
          <EmptyState icon={<Sparkles className="size-6" />} title="This deck is empty" body="Generate cards from a PDF or add your own."
            action={<Button asChild className="rounded-xl"><Link to="/smart-revision/generate" search={{ deck: deckId }}><Sparkles /> Generate flashcards</Link></Button>} />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cards match “{query}”.</p>
        ) : (
          <ul className="flex flex-col gap-3">{filtered.map((c, i) => <CardRow key={c.id} card={c} index={i} />)}</ul>
        )}
      </section>
    </div>
  );
}
