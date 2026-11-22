import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { PageHeader, StatTile } from "@/components/revision/page-header";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  dailyActivity,
  learningProgress,
  overview,
  ratingBreakdown,
  subjectStats,
  upcomingDue,
} from "@/lib/analytics";
import { useStudyData } from "@/lib/data/queries";
import { RATINGS, RATING_LABELS } from "@/lib/srs/scheduler";

export const Route = createFileRoute("/_authenticated/smart-revision/progress")({
  head: () => ({
    meta: [
      { title: "Progress — BrainStack" },
      {
        name: "description",
        content: "Your revision statistics: reviews, ratings and subject progress.",
      },
      { property: "og:title", content: "Progress — BrainStack" },
      {
        property: "og:description",
        content: "Your revision statistics: reviews, ratings and subject progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProgressPage,
});

const weeklyConfig = { total: { label: "Reviews", color: "var(--chart-1)" } } satisfies ChartConfig;
const learnedConfig = {
  learned: { label: "Cards learned", color: "var(--chart-1)" },
} satisfies ChartConfig;
const dueConfig = { count: { label: "Cards due", color: "var(--chart-2)" } } satisfies ChartConfig;

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const axisProps = { tickLine: false, axisLine: false, tickMargin: 8 } as const;

function ProgressPage() {
  const { cards, logs, isLoading } = useStudyData();
  const o = useMemo(() => overview(cards, logs, new Date()), [cards, logs]);
  const ratings = useMemo(() => ratingBreakdown(logs), [logs]);
  const subjects = useMemo(() => subjectStats(cards, logs), [cards, logs]);
  const weekly = useMemo(() => dailyActivity(logs, new Date(), 7), [logs]);
  const learned = useMemo(() => learningProgress(logs, new Date(), 30), [logs]);
  const due = useMemo(() => upcomingDue(cards, new Date(), 14), [cards]);
  if (isLoading)
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Smart Revision" title="Progress" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total reviews" value={o.totalReviews} icon={<span>∑</span>} />
        {RATINGS.map((r) => (
          <StatTile
            key={r}
            label={RATING_LABELS[r]}
            value={ratings[r]}
            icon={<span>{r}</span>}
            tone="accent"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Weekly activity" hint="Reviews per day, last 7 days">
          <ChartContainer config={weeklyConfig} className="aspect-auto h-56 w-full">
            <BarChart data={weekly}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis allowDecimals={false} width={28} {...axisProps} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar
                dataKey="total"
                fill="var(--color-total)"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ChartContainer>
        </ChartCard>
        <ChartCard title="Cards due in upcoming days" hint="Next 14 days (today includes overdue)">
          <ChartContainer config={dueConfig} className="aspect-auto h-56 w-full">
            <BarChart data={due}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} width={28} {...axisProps} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>
      <ChartCard
        title="Learning progress over time"
        hint="Total cards you've studied at least once, last 30 days"
      >
        <ChartContainer config={learnedConfig} className="aspect-auto h-64 w-full">
          <AreaChart data={learned}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={24} />
            <YAxis allowDecimals={false} width={28} {...axisProps} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              dataKey="learned"
              type="monotone"
              stroke="var(--color-learned)"
              strokeWidth={2}
              fill="var(--color-learned)"
              fillOpacity={0.12}
            />
          </AreaChart>
        </ChartContainer>
      </ChartCard>
      <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <h2 className="font-semibold">By subject</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {subjects.map((s) => (
            <li key={s.subject} className="flex justify-between py-2">
              <span>{s.subject}</span>
              <span className="text-muted-foreground">
                {s.cards} cards · {s.mastered} mastered · {s.accuracy ?? "–"}% accuracy
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
