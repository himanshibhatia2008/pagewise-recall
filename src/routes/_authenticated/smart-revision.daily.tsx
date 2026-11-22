import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  FastForward,
  Loader2,
  Play,
  Sparkles,
} from "lucide-react";
import { useMemo } from "react";

import { EmptyState, PageHeader, StatTile } from "@/components/revision/page-header";
import { Button } from "@/components/ui/button";
import { upcomingDue, overview } from "@/lib/analytics";
import { useStudyData } from "@/lib/data/queries";
import {
  NEW_CARDS_PER_DAY,
  buildDueQueue,
  dueCards,
  dueLaterToday,
  newCardAllowance,
  newCards,
} from "@/lib/srs/queue";
import { formatInterval } from "@/lib/srs/scheduler";

export const Route = createFileRoute("/_authenticated/smart-revision/daily")({
  head: () => ({
    meta: [
      { title: "Daily Revision — BrainStack" },
      {
        name: "description",
        content:
          "See the flashcards due today, new cards to learn and what's coming up, then start your revision.",
      },
      { property: "og:title", content: "Daily Revision — BrainStack" },
      {
        property: "og:description",
        content:
          "See the flashcards due today, new cards to learn and what's coming up, then start your revision.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DailyPage,
});

function DailyPage() {
  const { cards, decks, logs, isLoading, error } = useStudyData();
  const now = useMemo(() => new Date(), [cards, logs]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo(() => {
    const due = dueCards(cards, now);
    const later = dueLaterToday(cards, now);
    const allowance = newCardAllowance(logs, now);
    const fresh = newCards(cards);
    const session = buildDueQueue(cards, logs, now);
    const perDeck = decks
      .map((d) => {
        const dc = cards.filter((c) => c.deck_id === d.id);
        return {
          deck: d,
          due: dueCards(dc, now).length,
          fresh: newCards(dc).length,
          session: buildDueQueue(dc, logs, now).length,
        };
      })
      .filter((x) => x.due > 0 || x.fresh > 0);
    return {
      due,
      later,
      allowance,
      fresh,
      session,
      perDeck,
      ov: overview(cards, logs, now),
      upcoming: upcomingDue(cards, now, 7),
    };
  }, [cards, decks, logs, now]);

  if (isLoading)
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading today's revision…
      </p>
    );
  if (error)
    return (
      <p className="rounded-xl bg-destructive-soft px-4 py-3 text-sm text-destructive">
        Couldn't load your cards. Refresh to try again.
      </p>
    );

  if (cards.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Smart Revision" title="Daily Revision" />
        <EmptyState
          icon={<Sparkles className="size-6" />}
          title="No flashcards yet"
          body="Generate flashcards from your notes and they'll appear here for revision."
          action={
            <Button asChild className="rounded-xl">
              <Link to="/smart-revision/generate">
                <Sparkles /> Generate flashcards
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const newToday = Math.min(data.allowance, data.fresh.length);
  const nextLater = data.later[0];
  const maxUpcoming = Math.max(1, ...data.upcoming.map((u) => u.count));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={now.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        title="Daily Revision"
        description="Only cards that are due are included, so every review counts."
      />

      <section className="animate-rise relative overflow-hidden rounded-3xl bg-hero p-6 text-primary-foreground shadow-lift sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-primary-foreground/10" />
        {data.session.length > 0 ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-foreground/80">
              Today's session
            </p>
            <p className="mt-2 font-display text-4xl font-bold">{data.session.length} cards</p>
            <p className="mt-1 text-primary-foreground/85">
              {data.due.length} due for review · {newToday} new to learn
            </p>
            <Button asChild size="lg" variant="secondary" className="mt-6 rounded-xl font-semibold">
              <Link to="/smart-revision/review" search={{ mode: "due" }}>
                <Play /> Start today's revision
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-primary-foreground/80">
              <CheckCircle2 className="size-4" /> All done for now
            </p>
            <p className="mt-2 font-display text-3xl font-bold">You're caught up!</p>
            <p className="mt-1 text-primary-foreground/85">
              {nextLater
                ? `${data.later.length} more ${data.later.length === 1 ? "card comes" : "cards come"} due later today — next in ${formatInterval(new Date(nextLater.due).getTime() - now.getTime())}.`
                : "Nothing else is due today."}
              {data.allowance === 0 &&
                data.fresh.length > 0 &&
                ` You've learned your ${NEW_CARDS_PER_DAY} new cards for today.`}
            </p>
          </>
        )}
        <Button
          asChild
          size="lg"
          variant="ghost"
          className="mt-3 ml-0 rounded-xl text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:ml-2 sm:mt-6"
        >
          <Link to="/smart-revision/review" search={{ mode: "early" }}>
            <FastForward /> Study early
          </Link>
        </Button>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Due today"
          value={data.ov.dueToday}
          hint={`${data.due.length} due right now`}
          icon={<CalendarClock className="size-5" />}
        />
        <StatTile
          label="New cards available"
          value={newToday}
          hint={`${data.fresh.length} new in total · ${NEW_CARDS_PER_DAY}/day`}
          icon={<Sparkles className="size-5" />}
          tone="sky"
        />
        <StatTile
          label="Reviewed today"
          value={data.ov.reviewedToday}
          hint={`${data.ov.reviewsToday} ${data.ov.reviewsToday === 1 ? "rating" : "ratings"}`}
          icon={<CheckCircle2 className="size-5" />}
          tone="success"
        />
        <StatTile
          label="Upcoming (7 days)"
          value={data.upcoming.slice(1).reduce((s, u) => s + u.count, 0)}
          hint="after today"
          icon={<CalendarDays className="size-5" />}
          tone="accent"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <h2 className="font-semibold">By deck</h2>
          {data.perDeck.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No deck has cards due or new cards waiting.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {data.perDeck.map(({ deck, due, fresh, session }) => (
                <li key={deck.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/smart-revision/decks/$deckId"
                      params={{ deckId: deck.id }}
                      className="truncate font-medium hover:underline"
                    >
                      {deck.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {due} due · {fresh} new
                    </p>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant={session ? "default" : "outline"}
                    className="rounded-lg"
                  >
                    <Link
                      to="/smart-revision/review"
                      search={{ deck: deck.id, mode: session ? "due" : "early" }}
                    >
                      {session ? (
                        <>
                          <Play /> {session}
                        </>
                      ) : (
                        <>
                          <FastForward /> Early
                        </>
                      )}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <h2 className="font-semibold">Upcoming reviews</h2>
          <ul className="mt-4 flex flex-col gap-2.5">
            {data.upcoming.map((u) => (
              <li key={u.date} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">{u.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(u.count / maxUpcoming) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right font-semibold">{u.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
