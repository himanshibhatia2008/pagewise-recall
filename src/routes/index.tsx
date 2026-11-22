import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BarChart3, CalendarClock, FileText, FileUp, Sparkles, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStudyMaterials } from "@/lib/study-materials";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StudyMate AI — Your smart study companion" },
      {
        name: "description",
        content: "Upload PDF notes, turn them into flashcards and revise on a spaced repetition schedule.",
      },
      { property: "og:title", content: "StudyMate AI — Your smart study companion" },
      {
        property: "og:description",
        content: "Upload PDF notes, turn them into flashcards and revise on a spaced repetition schedule.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Step = { title: string; body: string; icon: LucideIcon; live: boolean };

const steps: Step[] = [
  {
    title: "Upload your notes",
    body: "Drop in PDF notes. We read the text page by page, right in your browser.",
    icon: FileUp,
    live: true,
  },
  {
    title: "Generate flashcards",
    body: "AI picks out key concepts, definitions and facts and writes question–answer cards.",
    icon: Sparkles,
    live: false,
  },
  {
    title: "Revise daily",
    body: "Rate each card Again, Hard, Good or Easy. Spaced repetition schedules the next review.",
    icon: CalendarClock,
    live: false,
  },
  {
    title: "Track progress",
    body: "See what you've mastered, what's due and how your week went.",
    icon: BarChart3,
    live: false,
  },
];

function Index() {
  const { materials } = useStudyMaterials();
  const readyCount = materials.filter((m) => m.status === "ready" || m.status === "partial").length;
  const pageCount = materials.reduce((sum, m) => sum + (m.verdict?.textPages ?? 0), 0);

  return (
    <div className="flex flex-col gap-10">
      <section className="animate-rise relative overflow-hidden rounded-3xl bg-hero p-8 text-primary-foreground shadow-lift sm:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-primary-foreground/10" />
        <div className="pointer-events-none absolute -bottom-24 right-24 size-48 rounded-full bg-primary-foreground/10" />
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-foreground/80">
          Smart Revision
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
          Turn your notes into flashcards you'll actually remember.
        </h1>
        <p className="mt-3 max-w-xl text-primary-foreground/85">
          StudyMate AI reads your PDFs, builds Anki-style cards and tells you exactly when to revise
          each one.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="secondary" className="rounded-xl font-semibold">
            <Link to="/smart-revision/upload">
              <FileUp /> Upload PDF
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="animate-rise rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <FileText className="size-5" />
            </span>
            <p className="text-sm font-medium text-muted-foreground">Notes ready this session</p>
          </div>
          <p className="mt-4 font-display text-4xl font-bold">{readyCount}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pageCount} readable {pageCount === 1 ? "page" : "pages"} extracted
          </p>
        </div>
        <Link
          to="/smart-revision/upload"
          className="animate-rise group flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40"
        >
          <div>
            <p className="font-display text-lg font-semibold">Start with a PDF</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Lecture notes, textbook chapters or handouts — up to 20 MB each.
            </p>
          </div>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            Go to upload <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </span>
        </Link>
      </section>

      <section>
        <h2 className="text-xl font-bold">How Smart Revision works</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="animate-rise rounded-2xl border border-border bg-card p-5 shadow-soft"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <Icon className="size-5" />
                  </span>
                  <span
                    className={
                      step.live
                        ? "rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success"
                        : "rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"
                    }
                  >
                    {step.live ? "Available" : "Coming next"}
                  </span>
                </div>
                <p className="mt-4 text-xs font-semibold text-muted-foreground">Step {i + 1}</p>
                <h3 className="mt-1 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
