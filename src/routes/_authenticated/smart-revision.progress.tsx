import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";

import { PageHeader, StatTile } from "@/components/revision/page-header";
import { overview, ratingBreakdown, subjectStats } from "@/lib/analytics";
import { useStudyData } from "@/lib/data/queries";
import { RATINGS, RATING_LABELS } from "@/lib/srs/scheduler";

export const Route = createFileRoute("/_authenticated/smart-revision/progress")({
  head: () => ({
    meta: [
      { title: "Progress — StudyMate AI" },
      { name: "description", content: "Your revision statistics: reviews, ratings and subject progress." },
      { property: "og:title", content: "Progress — StudyMate AI" },
      { property: "og:description", content: "Your revision statistics: reviews, ratings and subject progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProgressPage,
});

function ProgressPage() {
  const { cards, logs, isLoading } = useStudyData();
  const o = useMemo(() => overview(cards, logs, new Date()), [cards, logs]);
  const ratings = useMemo(() => ratingBreakdown(logs), [logs]);
  const subjects = useMemo(() => subjectStats(cards, logs), [cards, logs]);
  if (isLoading) return <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Smart Revision" title="Progress" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total reviews" value={o.totalReviews} icon={<span>∑</span>} />
        {RATINGS.map((r) => (
          <StatTile key={r} label={RATING_LABELS[r]} value={ratings[r]} icon={<span>{r}</span>} tone="accent" />
        ))}
      </div>
      <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <h2 className="font-semibold">By subject</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {subjects.map((s) => (
            <li key={s.subject} className="flex justify-between py-2">
              <span>{s.subject}</span>
              <span className="text-muted-foreground">{s.cards} cards · {s.mastered} mastered · {s.accuracy ?? "–"}% accuracy</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
