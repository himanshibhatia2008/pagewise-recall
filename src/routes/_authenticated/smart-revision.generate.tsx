import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckSquare, FileUp, Loader2, RefreshCw, Save, Sparkles, Square, Trash2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { DifficultyBadge } from "@/components/revision/difficulty-badge";
import { EmptyState, PageHeader } from "@/components/revision/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { decksQuery, keys, materialsQuery } from "@/lib/data/queries";
import { generateFlashcards, regenerateFlashcard } from "@/lib/flashcards/ai.functions";
import {
  DIFFICULTIES,
  LANGUAGES,
  LANGUAGE_LABELS,
  MAX_CARDS,
  dedupeCards,
  type Difficulty,
  type GeneratedCard,
  type Language,
} from "@/lib/flashcards/generation";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/smart-revision/generate")({
  validateSearch: z.object({ material: z.string().optional(), deck: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Generate flashcards with AI — StudyMate AI" },
      { name: "description", content: "Turn your PDF notes into question–answer flashcards, then preview, edit and save them to a deck." },
      { property: "og:title", content: "Generate flashcards with AI — StudyMate AI" },
      { property: "og:description", content: "Turn your PDF notes into question–answer flashcards, then preview, edit and save them to a deck." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GeneratePage,
});

type DraftCard = GeneratedCard & { key: string; selected: boolean; regenerating: boolean };
type RunOptions = { materialId: string; difficulty: Difficulty; language: Language; scope: "all" | "topic"; topic: string; subject: string };

const NEW_DECK = "__new__";

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium transition",
            value === o.value ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function GeneratePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const materials = useQuery(materialsQuery);
  const decks = useQuery(decksQuery);
  const generate = useServerFn(generateFlashcards);
  const regenerate = useServerFn(regenerateFlashcard);

  const [materialId, setMaterialId] = useState(search.material ?? "");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [language, setLanguage] = useState<Language>("en");
  const [scope, setScope] = useState<"all" | "topic">("all");
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState("");

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cards, setCards] = useState<DraftCard[]>([]);
  const [run, setRun] = useState<RunOptions | null>(null);

  const [deckChoice, setDeckChoice] = useState<string>(search.deck ?? NEW_DECK);
  const [deckName, setDeckName] = useState("");
  const [deckSubject, setDeckSubject] = useState("");
  const [deckUnit, setDeckUnit] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!materialId && materials.data?.[0]) setMaterialId(materials.data[0].id);
  }, [materials.data, materialId]);

  const material = materials.data?.find((m) => m.id === materialId);
  const selected = cards.filter((c) => c.selected);
  const deckList = decks.data ?? [];
  const anyRegenerating = cards.some((c) => c.regenerating);

  const onGenerate = async () => {
    if (!materialId) return;
    if (scope === "topic" && !topic.trim()) return void toast.error("Type the topic you want flashcards about.");
    setGenerating(true);
    setError(null);
    setNotice(null);
    const opts: RunOptions = { materialId, difficulty, language, scope, topic: topic.trim(), subject: subject.trim() };
    try {
      const res = await generate({
        data: { ...opts, count, topic: opts.topic || undefined, subject: opts.subject || undefined, avoid: [] },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRun(opts);
      setCards(res.cards.map((c) => ({ ...c, key: crypto.randomUUID(), selected: true, regenerating: false })));
      const notes: string[] = [];
      if (res.insufficient) notes.push(`The PDF had enough distinct material for ${res.cards.length} of the ${count} cards you asked for.`);
      if (res.truncated) notes.push("This PDF is long, so the AI read an even sample of every page. Pick a topic to go deeper.");
      setNotice(notes.join(" ") || null);
      if (!deckName) setDeckName(material ? material.file_name.replace(/\.pdf$/i, "") : res.subject);
      if (!deckSubject) setDeckSubject(res.subject);
    } catch {
      setError("We couldn't reach the flashcard generator. Check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  };

  const patchCard = (key: string, update: Partial<DraftCard>) =>
    setCards((prev) => prev.map((c) => (c.key === key ? { ...c, ...update } : c)));

  const onRegenerate = async (card: DraftCard) => {
    if (!run) return;
    patchCard(card.key, { regenerating: true });
    try {
      const res = await regenerate({
        data: {
          materialId: run.materialId,
          difficulty: card.difficulty,
          language: run.language,
          scope: run.scope,
          topic: run.topic || undefined,
          subject: card.subject || run.subject || undefined,
          avoid: cards.filter((c) => c.key !== card.key).map((c) => c.question),
          replace: { question: card.question, answer: card.answer, topic: card.topic },
        },
      });
      if (!res.ok || !res.cards[0]) {
        toast.error(res.ok ? "No new card came back. Try again." : res.error);
        patchCard(card.key, { regenerating: false });
        return;
      }
      patchCard(card.key, { ...res.cards[0], regenerating: false });
      toast.success("Card regenerated");
    } catch {
      toast.error("Couldn't regenerate this card. Please try again.");
      patchCard(card.key, { regenerating: false });
    }
  };

  const onSave = async () => {
    const chosen = selected.filter((c) => c.question.trim() && c.answer.trim());
    if (chosen.length === 0) return void toast.error("Select at least one card with a question and answer.");
    if (deckChoice === NEW_DECK && !deckName.trim()) return void toast.error("Give your new deck a name.");
    setSaving(true);
    try {
      let deckId = deckChoice;
      if (deckChoice === NEW_DECK) {
        const { data, error } = await supabase
          .from("decks")
          .insert({ name: deckName.trim(), subject: deckSubject.trim() || null, unit: deckUnit.trim() || null })
          .select("id")
          .single();
        if (error) throw error;
        deckId = data.id;
      }
      const { data: existing, error: exErr } = await supabase.from("flashcards").select("question").eq("deck_id", deckId);
      if (exErr) throw exErr;
      const unique = dedupeCards(chosen, (existing ?? []).map((e) => e.question));
      const skipped = chosen.length - unique.length;
      if (unique.length > 0) {
        const { error } = await supabase.from("flashcards").insert(
          unique.map((c) => ({
            deck_id: deckId,
            material_id: run?.materialId ?? null,
            question: c.question.trim(),
            answer: c.answer.trim(),
            subject: c.subject || deckSubject || null,
            topic: c.topic || null,
            difficulty: c.difficulty,
            source_page: c.sourcePage,
            language: run?.language ?? "en",
          })),
        );
        if (error) throw error;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.cards }),
        queryClient.invalidateQueries({ queryKey: keys.decks }),
      ]);
      toast.success(`Saved ${unique.length} ${unique.length === 1 ? "card" : "cards"}`, {
        description: skipped ? `${skipped} duplicate ${skipped === 1 ? "question was" : "questions were"} already in this deck.` : undefined,
      });
      setCards([]);
      void navigate({ to: "/smart-revision/decks/$deckId", params: { deckId } });
    } catch (err) {
      toast.error("Couldn't save your cards", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const allSelected = useMemo(() => cards.length > 0 && cards.every((c) => c.selected), [cards]);

  if (!materials.isLoading && (materials.data?.length ?? 0) === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Smart Revision · Step 2" title="Generate flashcards" />
        <EmptyState
          icon={<FileUp className="size-6" />}
          title="Upload a PDF first"
          body="Flashcards are written from the actual text of your notes, so start by uploading a PDF."
          action={<Button asChild className="rounded-xl"><Link to="/smart-revision/upload"><FileUp /> Upload PDF</Link></Button>}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Smart Revision · Step 2"
        title="Generate flashcards"
        description="AI reads the text of your PDF, picks out key concepts, definitions and facts, and writes question–answer cards. Review them before saving."
      />

      <section className="animate-rise grid gap-6 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>Study material</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder={materials.isLoading ? "Loading…" : "Choose a PDF"} /></SelectTrigger>
              <SelectContent>
                {materials.data?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.file_name} · {m.text_page_count} pages</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>What to cover</Label>
            <Segmented label="What to cover" value={scope} onChange={setScope} options={[{ value: "all", label: "Entire PDF" }, { value: "topic", label: "A specific topic" }]} />
            {scope === "topic" && (
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Photosynthesis, French Revolution causes" className="h-11 rounded-xl" maxLength={200} />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="subject">Subject <span className="font-normal text-muted-foreground">(optional — AI detects it otherwise)</span></Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Biology" className="h-11 rounded-xl" maxLength={120} />
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Number of flashcards</Label>
              <span className="rounded-lg bg-primary-soft px-2.5 py-1 font-display text-sm font-bold text-primary">{count}</span>
            </div>
            <Slider min={1} max={MAX_CARDS} step={1} value={[count]} onValueChange={(v) => setCount(v[0] ?? 10)} aria-label="Number of flashcards" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Difficulty</Label>
            <Segmented label="Difficulty" value={difficulty} onChange={setDifficulty} options={DIFFICULTIES.map((d) => ({ value: d, label: d[0]!.toUpperCase() + d.slice(1) }))} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Language</Label>
            <Segmented label="Language" value={language} onChange={setLanguage} options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))} />
          </div>
          <Button onClick={onGenerate} disabled={!materialId || generating} size="lg" className="mt-auto h-12 rounded-xl font-semibold">
            {generating ? <><Loader2 className="animate-spin" /> Writing your flashcards…</> : <><Wand2 /> {cards.length ? "Generate a new set" : "Generate flashcards"}</>}
          </Button>
        </div>
      </section>

      {error && (
        <div role="alert" className="animate-rise flex items-start gap-3 rounded-2xl bg-destructive-soft p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Generation didn't work</p>
            <p className="mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={onGenerate} className="rounded-lg">Try again</Button>
        </div>
      )}

      {generating && (
        <div className="grid gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-4/5" />
            </div>
          ))}
          <p className="text-center text-sm text-muted-foreground">Reading your notes and writing cards — this can take up to a minute.</p>
        </div>
      )}

      {!generating && cards.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Preview <span className="text-muted-foreground">({selected.length} of {cards.length} selected)</span></h2>
              <Button variant="ghost" size="sm" onClick={() => setCards((p) => p.map((c) => ({ ...c, selected: !allSelected })))}>
                {allSelected ? <Square /> : <CheckSquare />} {allSelected ? "Deselect all" : "Select all"}
              </Button>
            </div>
            {notice && <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-foreground">{notice}</p>}
            <ol className="flex flex-col gap-3">
              {cards.map((c, i) => (
                <li key={c.key} className={cn("animate-rise rounded-2xl border bg-card p-4 shadow-soft transition sm:p-5", c.selected ? "border-primary/40" : "border-border opacity-70")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => patchCard(c.key, { selected: !c.selected })}
                      className="text-primary"
                      aria-label={c.selected ? `Deselect card ${i + 1}` : `Select card ${i + 1}`}
                      aria-pressed={c.selected}
                    >
                      {c.selected ? <CheckSquare className="size-5" /> : <Square className="size-5 text-muted-foreground" />}
                    </button>
                    <span className="text-sm font-semibold text-muted-foreground">Card {i + 1}</span>
                    <DifficultyBadge value={c.difficulty} />
                    {c.topic && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">{c.topic}</span>}
                    {c.sourcePage && <span className="text-xs text-muted-foreground">Page {c.sourcePage}</span>}
                    <div className="ml-auto flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onRegenerate(c)} disabled={c.regenerating} aria-label={`Regenerate card ${i + 1}`}>
                        <RefreshCw className={cn(c.regenerating && "animate-spin")} /> <span className="hidden sm:inline">Regenerate</span>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setCards((p) => p.filter((x) => x.key !== c.key))} aria-label={`Delete card ${i + 1}`} className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive">
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <div className={cn("mt-3 grid gap-3", c.regenerating && "pointer-events-none opacity-50")}>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground" htmlFor={`q-${c.key}`}>Question</Label>
                      <Textarea id={`q-${c.key}`} value={c.question} onChange={(e) => patchCard(c.key, { question: e.target.value })} rows={2} className="resize-y rounded-xl font-medium" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground" htmlFor={`a-${c.key}`}>Answer</Label>
                      <Textarea id={`a-${c.key}`} value={c.answer} onChange={(e) => patchCard(c.key, { answer: e.target.value })} rows={3} className="resize-y rounded-xl" />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-center gap-2">
                <Save className="size-5 text-primary" />
                <h2 className="font-semibold">Save to a deck</h2>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Deck</Label>
                <Select value={deckChoice} onValueChange={setDeckChoice}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_DECK}>+ Create a new deck</SelectItem>
                    {deckList.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}{d.unit ? ` · ${d.unit}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {deckChoice === NEW_DECK && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="deck-name">Deck name</Label>
                    <Input id="deck-name" value={deckName} onChange={(e) => setDeckName(e.target.value)} maxLength={120} className="rounded-xl" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="deck-subject">Subject</Label>
                      <Input id="deck-subject" value={deckSubject} onChange={(e) => setDeckSubject(e.target.value)} maxLength={120} className="rounded-xl" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="deck-unit">Unit</Label>
                      <Input id="deck-unit" value={deckUnit} onChange={(e) => setDeckUnit(e.target.value)} placeholder="e.g. Unit 3" maxLength={120} className="rounded-xl" />
                    </div>
                  </div>
                </div>
              )}
              <Button onClick={onSave} disabled={saving || selected.length === 0 || anyRegenerating} className="h-11 rounded-xl font-semibold">
                {saving ? <Loader2 className="animate-spin" /> : <Sparkles />} Save {selected.length} {selected.length === 1 ? "card" : "cards"}
              </Button>
              <p className="text-xs text-muted-foreground">Saved cards become “new” and show up in today's Daily Revision.</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
