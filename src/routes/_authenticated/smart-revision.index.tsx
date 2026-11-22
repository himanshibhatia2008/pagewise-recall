import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, FileUp, Layers, Loader2, Play, Sparkles, Trophy } from "lucide-react";
import { useMemo } from "react";

import { PageHeader, StatTile } from "@/components/revision/page-header";
import { Button } from "@/components/ui/button";
import { overview } from "@/lib/analytics";
import { useStudyData } from "@/lib/data/queries";

export const Route = createFileRoute("/_authenticated/smart-revision/")({
  head: () => ({
    meta: [
      { title: "Smart Revision dashboard — StudyMate AI" },
      { name: "description", content: "Your flashcards, cards due today and revision progress at a glance." },
      { property: "og:title", content: "Smart Revision dashboard — StudyMate AI" },
      { property: "og:description", content: "Your flashcards, cards due today and revision progress at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { cards, decks, logs, isLoading } = useStudyData();
  const o = useMemo(() => overview(cards, logs, new Date()), [cards, logs]);
  if (isLoading) return <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Smart Revision"
        title="Dashboard"
        actions={
          <>
            <Button asChild variant="outline" className="rounded-xl"><Link to="/smart-revision/upload"><FileUp /> Upload PDF</Link></Button>
            <Button asChild variant="outline" className="rounded-xl"><Link to="/smart-revision/generate"><Sparkles /> Generate Flashcards</Link></Button>
            <Button asChild variant="outline" className="rounded-xl"><Link to="/smart-revision/decks"><Layers /> View My Decks</Link></Button>
            <Button asChild className="rounded-xl"><Link to="/smart-revision/daily"><Play /> Start Today's Revision</Link></Button>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Total flashcards" value={o.totalCards} icon={<Sparkles className="size-5" />} />
        <StatTile label="Due today" value={o.dueToday} icon={<CalendarClock className="size-5" />} tone="accent" />
        <StatTile label="Reviewed today" value={o.reviewedToday} icon={<CheckCircle2 className="size-5" />} tone="success" />
        <StatTile label="Mastered" value={o.masteredCards} icon={<Trophy className="size-5" />} tone="success" />
        <StatTile label="Decks" value={decks.length} icon={<Layers className="size-5" />} tone="sky" />
        <StatTile label="Overall progress" value={`${o.masteredPercent}%`} hint={`${o.studiedPercent}% studied at least once`} icon={<Trophy className="size-5" />} tone="warning" />
      </div>
    </div>
  );
}
