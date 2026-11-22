import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarCheck, Clock, Eye, FastForward, Loader2, PartyPopper, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { DifficultyBadge } from "@/components/revision/difficulty-badge";
import { EmptyState } from "@/components/revision/page-header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { keys, useStudyData, type Flashcard } from "@/lib/data/queries";
import { buildDueQueue, buildEarlyQueue } from "@/lib/srs/queue";
import {
  RATINGS,
  RATING_LABELS,
  formatInterval,
  previewIntervals,
  scheduleReview,
  type RatingValue,
  type ScheduleFields,
} from "@/lib/srs/scheduler";
import { applyRating, canRate, expectedReps, frontier, type SessionEntry } from "@/lib/srs/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/smart-revision/review")({
  validateSearch: z.object({ deck: z.string().optional(), mode: z.enum(["due", "early"]).default("due") }),
  head: () => ({
    meta: [
      { title: "Revision session — StudyMate AI" },
      { name: "description", content: "Revise your flashcards one at a time and rate how well you remembered each one." },
      { property: "og:title", content: "Revision session — StudyMate AI" },
      { property: "og:description", content: "Revise your flashcards one at a time and rate how well you remembered each one." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewPage,
});

const ratingStyles: Record<RatingValue, string> = {
  1: "border-destructive/30 bg-destructive-soft text-destructive hover:bg-destructive/15",
  2: "border-warning/40 bg-warning-soft text-warning-foreground hover:bg-warning/20",
  3: "border-success/30 bg-success-soft text-success hover:bg-success/15",
  4: "border-sky/30 bg-sky-soft text-sky hover:bg-sky/15",
};

type Entry = SessionEntry<Flashcard>;

function schedOf(c: Flashcard): ScheduleFields {
  return {
    state: c.state,
    due: c.due,
    stability: c.stability,
    fsrs_difficulty: c.fsrs_difficulty,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    last_review: c.last_review,
  };
}

function ReviewPage() {
  const { deck, mode } = Route.useSearch();
  // A new deck/mode starts a fresh session.
  return <Session key={`${deck ?? "all"}-${mode}`} deck={deck} mode={mode} />;
}

function Session({ deck, mode }: { deck: string | undefined; mode: "due" | "early" }) {
  const { cards, decks, logs, isLoading, error } = useStudyData();
  const queryClient = useQueryClient();

  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const sessionId = useRef(crypto.randomUUID());
  const startedAt = useRef(Date.now());
  const [finishedAt, setFinishedAt] = useState<number | null>(null);

  // Freeze the queue once when data arrives, so refetches don't reshuffle the session.
  useEffect(() => {
    if (entries || isLoading || error) return;
    const pool = deck ? cards.filter((c) => c.deck_id === deck) : cards;
    const now = new Date();
    const queue = mode === "early" ? buildEarlyQueue(pool, logs, now) : buildDueQueue(pool, logs, now);
    setEntries(queue.map((card) => ({ key: crypto.randomUUID(), card, reviewId: crypto.randomUUID() })));
    startedAt.current = Date.now();
  }, [entries, isLoading, error, cards, logs, deck, mode]);

  const list = entries ?? [];
  const front = frontier(list);
  const done = list.length > 0 && front >= list.length;
  const current = list[pos];
  const isPast = current?.rating !== undefined;
  const showAnswer = revealed || isPast;
  const deckName = deck ? decks.find((d) => d.id === deck)?.name : undefined;
  const intervals = useMemo(() => (current ? previewIntervals(schedOf(current.card), new Date()) : null), [current]);

  useEffect(() => {
    if (done && finishedAt === null) setFinishedAt(Date.now());
  }, [done, finishedAt]);

  const rate = useCallback(
    async (rating: RatingValue) => {
      if (!entries || !current || saving || !canRate(entries, pos)) return;
      const now = new Date();
      const before = schedOf(current.card);
      const { next, elapsedDays } = scheduleReview(before, rating, now);
      setSaving(true);
      const { error: rpcError } = await supabase.rpc("apply_review", {
        p_review_id: current.reviewId,
        p_card_id: current.card.id,
        p_session_id: sessionId.current,
        p_rating: rating,
        p_expected_reps: expectedReps(current),
        p_card_before: before as unknown as Json,
        p_state: next.state,
        p_due: next.due,
        p_stability: next.stability,
        p_difficulty: next.fsrs_difficulty,
        p_scheduled_days: next.scheduled_days,
        p_learning_steps: next.learning_steps,
        p_reps: next.reps,
        p_lapses: next.lapses,
        p_last_review: next.last_review ?? now.toISOString(),
        p_elapsed_days: elapsedDays,
      });
      setSaving(false);
      if (rpcError) {
        toast.error(
          rpcError.message.includes("card_changed")
            ? "This card was changed in another tab. Reload the page to continue."
            : "Your rating wasn't saved. Check your connection and try again.",
        );
        return;
      }
      const updated = applyRating(entries, pos, rating, next, now, () => crypto.randomUUID());
      setEntries(updated);
      setPos(frontier(updated));
      setRevealed(false);
      void queryClient.invalidateQueries({ queryKey: keys.cards });
      void queryClient.invalidateQueries({ queryKey: keys.logs });
      void queryClient.invalidateQueries({ queryKey: keys.recent });
    },
    [entries, current, pos, saving, queryClient],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (!current) return;
      if ((e.key === " " || e.key === "Enter") && !showAnswer) {
        e.preventDefault();
        setRevealed(true);
      } else if (showAnswer && ["1", "2", "3", "4"].includes(e.key)) {
        void rate(Number(e.key) as RatingValue);
      } else if (e.key === "ArrowLeft" && pos > 0) {
        setPos((p) => p - 1);
        setRevealed(false);
      } else if (e.key === "ArrowRight" && pos < front) {
        setPos((p) => p + 1);
        setRevealed(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, showAnswer, rate, pos, front]);

  if (isLoading || (!entries && !error)) {
    return <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Preparing your session…</p>;
  }
  if (error) return <p className="rounded-xl bg-destructive-soft px-4 py-3 text-sm text-destructive">Couldn't load your cards. Refresh to try again.</p>;

  if (list.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck className="size-6" />}
        title={mode === "early" ? "Nothing left to study early" : "You're all caught up!"}
        body={mode === "early" ? "Every card is already scheduled for today or you have no cards yet." : "No cards are due right now. Come back later, or study upcoming cards early."}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {mode === "due" && cards.length > 0 && (
              <Button asChild className="rounded-xl"><Link to="/smart-revision/review" search={{ deck, mode: "early" }}><FastForward /> Study early</Link></Button>
            )}
            <Button asChild variant="outline" className="rounded-xl"><Link to="/smart-revision/daily">Daily Revision</Link></Button>
          </div>
        }
      />
    );
  }

  if (done && pos >= list.length) return <Summary entries={list} startedAt={startedAt.current} finishedAt={finishedAt ?? Date.now()} onBack={() => setPos(list.length - 1)} />;
  if (!current) return null;

  const ratedCount = list.filter((e) => e.rating !== undefined).length;
  const lockedPast = isPast && !canRate(list, pos);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="rounded-lg">
          <Link to="/smart-revision/daily"><X /> Exit</Link>
        </Button>
        <div className="flex-1">
          <div className="flex justify-between text-xs font-medium text-muted-foreground">
            <span>{deckName ?? "All decks"}{mode === "early" ? " · studying early" : ""}</span>
            <span>Card {Math.min(pos + 1, list.length)} of {list.length}</span>
          </div>
          <Progress value={(ratedCount / list.length) * 100} className="mt-1.5 h-2 bg-muted" aria-label="Session progress" />
        </div>
      </div>

      <article key={current.key} className="animate-rise flex min-h-[22rem] flex-col rounded-3xl border border-border bg-card p-6 shadow-lift sm:p-10">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <DifficultyBadge value={current.card.difficulty} />
          {current.card.topic && <span className="rounded-full bg-accent px-2.5 py-0.5 font-medium text-accent-foreground">{current.card.topic}</span>}
          {current.card.subject && <span className="text-muted-foreground">{current.card.subject}</span>}
          {current.card.source_page && <span className="text-muted-foreground">· Page {current.card.source_page}</span>}
          {current.card.state === 0 && <span className="ml-auto rounded-full bg-sky-soft px-2.5 py-0.5 font-semibold text-sky">New card</span>}
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Question</p>
        <h2 className="mt-2 font-display text-2xl font-semibold leading-snug sm:text-3xl">{current.card.question}</h2>
        {showAnswer ? (
          <div className="animate-rise mt-8 border-t border-dashed border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Answer</p>
            <p className="mt-2 whitespace-pre-line text-lg leading-relaxed">{current.card.answer}</p>
          </div>
        ) : (
          <div className="mt-auto flex justify-center pt-10">
            <Button size="lg" onClick={() => setRevealed(true)} className="h-12 rounded-xl px-8 font-semibold">
              <Eye /> Show answer
            </Button>
          </div>
        )}
      </article>

      {showAnswer && intervals && (
        <div className="animate-rise">
          {isPast && (
            <p className="mb-2 text-center text-sm text-muted-foreground">
              You rated this <span className="font-semibold text-foreground">{RATING_LABELS[current.rating!]}</span>
              {current.after && <> · next review in {formatInterval(new Date(current.after.due).getTime() - Date.now())}</>}
              {lockedPast ? " · you've reviewed this card again since, so this rating is locked." : " · pick another to change it."}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATINGS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={saving || lockedPast}
                onClick={() => rate(r)}
                className={cn(
                  "flex flex-col items-center rounded-2xl border px-3 py-3 font-semibold transition disabled:opacity-50",
                  ratingStyles[r],
                  current.rating === r && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                )}
              >
                <span>{RATING_LABELS[r]}</span>
                <span className="text-xs font-medium opacity-80">{formatInterval(intervals[r])}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 hidden text-center text-xs text-muted-foreground sm:block">Shortcuts: Space to reveal · 1–4 to rate · ← → to move</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={pos === 0} onClick={() => { setPos((p) => p - 1); setRevealed(false); }}>
          <ArrowLeft /> Previous
        </Button>
        {saving && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Saving…</span>}
        <Button variant="ghost" disabled={pos >= front} onClick={() => { setPos((p) => p + 1); setRevealed(false); }}>
          Next <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function Summary({ entries, startedAt, finishedAt, onBack }: { entries: Entry[]; startedAt: number; finishedAt: number; onBack: () => void }) {
  const rated = entries.filter((e) => e.rating !== undefined);
  const counts: Record<RatingValue, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  rated.forEach((e) => counts[e.rating!]++);
  const latest = new Map<string, Entry>();
  rated.forEach((e) => latest.set(e.card.id, e));
  const nextDue = [...latest.values()].map((e) => e.after!.due).sort()[0];
  const minutes = Math.max(1, Math.round((finishedAt - startedAt) / 60_000));
  const recalled = rated.length ? Math.round(((rated.length - counts[1]) / rated.length) * 100) : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
      <span className="animate-rise flex size-16 items-center justify-center rounded-3xl bg-hero text-primary-foreground shadow-lift"><PartyPopper className="size-8" /></span>
      <div className="animate-rise">
        <h1 className="text-3xl font-bold">Session complete!</h1>
        <p className="mt-2 text-muted-foreground">Your progress is saved. Each card is scheduled for the moment you're about to forget it.</p>
      </div>
      <div className="grid w-full grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft"><Trophy className="mx-auto size-5 text-primary" /><p className="mt-2 font-display text-2xl font-bold">{latest.size}</p><p className="text-xs text-muted-foreground">cards revised</p></div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft"><CalendarCheck className="mx-auto size-5 text-success" /><p className="mt-2 font-display text-2xl font-bold">{recalled}%</p><p className="text-xs text-muted-foreground">remembered</p></div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft"><Clock className="mx-auto size-5 text-sky" /><p className="mt-2 font-display text-2xl font-bold">{minutes} min</p><p className="text-xs text-muted-foreground">time spent</p></div>
      </div>
      <div className="grid w-full grid-cols-4 gap-2">
        {RATINGS.map((r) => (
          <div key={r} className={cn("rounded-2xl border px-2 py-3", ratingStyles[r])}>
            <p className="font-display text-xl font-bold">{counts[r]}</p>
            <p className="text-xs font-semibold">{RATING_LABELS[r]}</p>
          </div>
        ))}
      </div>
      {nextDue && (
        <p className="text-sm text-muted-foreground">
          Next card from this session is due{" "}
          <span className="font-semibold text-foreground">
            {new Date(nextDue).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </span>
          .
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild className="rounded-xl"><Link to="/smart-revision/daily">Back to Daily Revision</Link></Button>
        <Button asChild variant="outline" className="rounded-xl"><Link to="/smart-revision/progress">See my progress</Link></Button>
        <Button variant="ghost" onClick={onBack}><ArrowLeft /> Review last card</Button>
      </div>
    </div>
  );
}
