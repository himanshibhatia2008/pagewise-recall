import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  FileUp,
  Layers,
  Loader2,
  Play,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useMemo } from "react";

import { PageHeader, StatTile } from "@/components/revision/page-header";
import { Button } from "@/components/ui/button";
import { overview, upcomingDue } from "@/lib/analytics";
import { recentActivityQuery, useStudyData } from "@/lib/data/queries";
import { RATING_LABELS, type RatingValue } from "@/lib/srs/scheduler";

export const Route = createFileRoute("/_authenticated/smart-revision/")({
  head: () => ({
    meta: [
      { title: "Smart Revision dashboard — BrainStack" },
      {
        name: "description",
        content: "Your flashcards, cards due today and revision progress at a glance.",
      },
      { property: "og:title", content: "Smart Revision dashboard — BrainStack" },
      {
        property: "og:description",
        content: "Your flashcards, cards due today and revision progress at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { cards, decks, logs, isLoading } = useStudyData();
  const recent = useQuery(recentActivityQuery);
  const o = useMemo(() => overview(cards, logs, new Date()), [cards, logs]);
  const upcoming = useMemo(() => upcomingDue(cards, new Date(), 7), [cards]);
  const maxUpcoming = Math.max(1, ...upcoming.map((u) => u.count));
  if (isLoading)
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Smart Revision"
        title="Dashboard"
        actions={
          <>
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/smart-revision/upload">
                <FileUp /> Upload PDF
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/smart-revision/generate">
                <Sparkles /> Generate Flashcards
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/smart-revision/decks">
                <Layers /> View My Decks
              </Link>
            </Button>
            <Button asChild className="rounded-xl">
              <Link to="/smart-revision/daily">
                <Play /> Start Today's Revision
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label="Total flashcards"
          value={o.totalCards}
          icon={<Sparkles className="size-5" />}
        />
        <StatTile
          label="Due today"
          value={o.dueToday}
          icon={<CalendarClock className="size-5" />}
          tone="accent"
        />
        <StatTile
          label="Reviewed today"
          value={o.reviewedToday}
          icon={<CheckCircle2 className="size-5" />}
          tone="success"
        />
        <StatTile
          label="Mastered"
          value={o.masteredCards}
          icon={<Trophy className="size-5" />}
          tone="success"
        />
        <StatTile
          label="Decks"
          value={decks.length}
          icon={<Layers className="size-5" />}
          tone="sky"
        />
        <StatTile
          label="Overall progress"
          value={`${o.masteredPercent}%`}
          hint={`${o.studiedPercent}% studied at least once`}
          icon={<Trophy className="size-5" />}
          tone="warning"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <h2 className="font-semibold">Upcoming revision dates</h2>
          <ul className="mt-4 flex flex-col gap-2.5">
            {upcoming.map((u) => (
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
        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <h2 className="font-semibold">Recent revision activity</h2>
          {recent.isLoading ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          ) : recent.error ? (
            <p className="mt-4 rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive">
              Couldn't load recent activity. Refresh to try again.
            </p>
          ) : !recent.data?.length ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No reviews yet. Start today's revision and your ratings will appear here.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {recent.data.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {r.flashcards?.question ?? "Deleted card"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.reviewed_at), { addSuffix: true })} · next
                      review {formatDistanceToNow(new Date(r.due_after), { addSuffix: true })}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {RATING_LABELS[r.rating as RatingValue]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
