import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DifficultyBadge } from "@/components/revision/difficulty-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { keys, type Flashcard } from "@/lib/data/queries";
import { DIFFICULTIES } from "@/lib/flashcards/generation";
import { CardState, STATE_LABELS, isMastered } from "@/lib/srs/scheduler";

function whenDue(card: Flashcard) {
  if (card.state === CardState.New) return "Not studied yet";
  const due = new Date(card.due);
  if (due.getTime() <= Date.now()) return "Due now";
  return `Next review ${due.toLocaleDateString(undefined, { day: "numeric", month: "short", year: due.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined })}`;
}

export function CardRow({ card, index }: { card: Flashcard; index: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(card.question);
  const [answer, setAnswer] = useState(card.answer);
  const [topic, setTopic] = useState(card.topic ?? "");
  const [difficulty, setDifficulty] = useState(card.difficulty);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    if (!question.trim() || !answer.trim()) return void toast.error("Question and answer can't be empty.");
    setBusy(true);
    const { error } = await supabase
      .from("flashcards")
      .update({ question: question.trim(), answer: answer.trim(), topic: topic.trim() || null, difficulty })
      .eq("id", card.id);
    setBusy(false);
    if (error) return void toast.error("Couldn't save", { description: error.message });
    await queryClient.invalidateQueries({ queryKey: keys.cards });
    setEditing(false);
    toast.success("Card updated");
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.from("flashcards").delete().eq("id", card.id);
    setBusy(false);
    if (error) return void toast.error("Couldn't delete", { description: error.message });
    await Promise.all([queryClient.invalidateQueries({ queryKey: keys.cards }), queryClient.invalidateQueries({ queryKey: keys.logs })]);
    toast.success("Card deleted");
  };

  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-muted-foreground">#{index + 1}</span>
        <DifficultyBadge value={card.difficulty} />
        <span className={isMastered(card) ? "rounded-full bg-success-soft px-2.5 py-0.5 font-semibold text-success" : "rounded-full bg-muted px-2.5 py-0.5 font-semibold text-muted-foreground"}>
          {isMastered(card) ? "Mastered" : STATE_LABELS[card.state]}
        </span>
        {card.topic && <span className="rounded-full bg-accent px-2.5 py-0.5 font-medium text-accent-foreground">{card.topic}</span>}
        {card.source_page && <span className="text-muted-foreground">Page {card.source_page}</span>}
        <span className="text-muted-foreground">· {whenDue(card)}{card.reps > 0 ? ` · ${card.reps} ${card.reps === 1 ? "review" : "reviews"}` : ""}</span>
        <div className="ml-auto flex gap-1">
          {!editing && (
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(true)} aria-label={`Edit card ${index + 1}`}><Pencil /></Button>
          )}
          {confirmDelete ? (
            <>
              <Button variant="destructive" size="sm" className="h-8" onClick={remove} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : "Delete"}</Button>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setConfirmDelete(false)}>Keep</Button>
            </>
          ) : (
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:bg-destructive-soft hover:text-destructive" onClick={() => setConfirmDelete(true)} aria-label={`Delete card ${index + 1}`}><Trash2 /></Button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="mt-3 grid gap-3">
          <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} aria-label="Question" className="rounded-xl font-medium" />
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} aria-label="Answer" className="rounded-xl" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic" aria-label="Topic" className="rounded-xl" />
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="rounded-xl" aria-label="Difficulty"><SelectValue /></SelectTrigger>
              <SelectContent>{DIFFICULTIES.map((d) => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy} className="rounded-lg">{busy ? <Loader2 className="animate-spin" /> : <Check />} Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setQuestion(card.question); setAnswer(card.answer); setTopic(card.topic ?? ""); setDifficulty(card.difficulty); }}><X /> Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-4">
          <p className="font-medium">{card.question}</p>
          <p className="text-sm text-muted-foreground sm:border-l sm:border-border sm:pl-4">{card.answer}</p>
        </div>
      )}
    </li>
  );
}
