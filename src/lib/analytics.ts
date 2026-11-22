// Pure aggregation of revision statistics from the user's real cards and review history.
import { CardState, isMastered, type RatingValue } from "@/lib/srs/scheduler";
import { endOfLocalDay, startOfLocalDay } from "@/lib/srs/queue";

export type StatCard = {
  id: string;
  deck_id: string;
  subject: string | null;
  state: number;
  due: string;
  scheduled_days: number;
  reps: number;
  created_at: string;
};
export type StatLog = { card_id: string; rating: number; state_before: number; reviewed_at: string };

export type DayBucket = { date: string; label: string; again: number; hard: number; good: number; easy: number; total: number };

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const RATING_KEYS = { 1: "again", 2: "hard", 3: "good", 4: "easy" } as const;

export function ratingBreakdown(logs: StatLog[]): Record<RatingValue, number> {
  const out: Record<RatingValue, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const l of logs) if (l.rating >= 1 && l.rating <= 4) out[l.rating as RatingValue]++;
  return out;
}

/** Reviews per local day for the last `days` days (oldest first), split by rating. */
export function dailyActivity(logs: StatLog[], now: Date, days: number): DayBucket[] {
  const start = startOfLocalDay(now);
  start.setDate(start.getDate() - (days - 1));
  const buckets: DayBucket[] = [];
  const index = new Map<string, DayBucket>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const b: DayBucket = {
      date: dayKey(d),
      label: d.toLocaleDateString(undefined, days <= 7 ? { weekday: "short" } : { day: "numeric", month: "short" }),
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
      total: 0,
    };
    buckets.push(b);
    index.set(b.date, b);
  }
  for (const l of logs) {
    const b = index.get(dayKey(new Date(l.reviewed_at)));
    const key = RATING_KEYS[l.rating as RatingValue];
    if (!b || !key) continue;
    b[key]++;
    b.total++;
  }
  return buckets;
}

/** Cards coming due on each of the next `days` local days (today includes overdue cards). */
export function upcomingDue(cards: StatCard[], now: Date, days: number): { date: string; label: string; count: number }[] {
  const today = startOfLocalDay(now);
  const out = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      date: dayKey(d),
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
      count: 0,
    };
  });
  const index = new Map(out.map((o, i) => [o.date, i]));
  const endToday = endOfLocalDay(now).getTime();
  for (const c of cards) {
    if (c.state === CardState.New) continue;
    const due = new Date(c.due);
    const i = due.getTime() < endToday ? 0 : index.get(dayKey(due));
    if (i !== undefined) out[i]!.count++;
  }
  return out;
}

/** Cumulative cards studied at least once and cards mastered... per day, from review history. */
export function learningProgress(logs: StatLog[], now: Date, days: number): { date: string; label: string; learned: number; reviews: number }[] {
  const start = startOfLocalDay(now);
  start.setDate(start.getDate() - (days - 1));
  const firstSeen = new Map<string, number>();
  for (const l of logs) {
    const t = new Date(l.reviewed_at).getTime();
    const prev = firstSeen.get(l.card_id);
    if (prev === undefined || t < prev) firstSeen.set(l.card_id, t);
  }
  const activity = dailyActivity(logs, now, days);
  const firsts = [...firstSeen.values()].sort((a, b) => a - b);
  let p = 0;
  return activity.map((b, i) => {
    const end = new Date(start);
    end.setDate(start.getDate() + i + 1);
    while (p < firsts.length && firsts[p]! < end.getTime()) p++;
    return { date: b.date, label: b.label, learned: p, reviews: b.total };
  });
}

export type SubjectStat = { subject: string; cards: number; studied: number; mastered: number; reviews: number; accuracy: number | null };

export function subjectStats(cards: StatCard[], logs: StatLog[]): SubjectStat[] {
  const bySubject = new Map<string, SubjectStat & { correct: number }>();
  const cardSubject = new Map<string, string>();
  for (const c of cards) {
    const s = c.subject?.trim() || "Uncategorised";
    cardSubject.set(c.id, s);
    const row = bySubject.get(s) ?? { subject: s, cards: 0, studied: 0, mastered: 0, reviews: 0, accuracy: null, correct: 0 };
    row.cards++;
    if (c.reps > 0) row.studied++;
    if (isMastered(c)) row.mastered++;
    bySubject.set(s, row);
  }
  for (const l of logs) {
    const row = bySubject.get(cardSubject.get(l.card_id) ?? "");
    if (!row) continue;
    row.reviews++;
    if (l.rating > 1) row.correct++;
  }
  return [...bySubject.values()]
    .map(({ correct, ...r }) => ({ ...r, accuracy: r.reviews ? Math.round((correct / r.reviews) * 100) : null }))
    .sort((a, b) => b.cards - a.cards);
}

export type Overview = {
  totalCards: number;
  newCards: number;
  studiedCards: number;
  masteredCards: number;
  dueToday: number;
  reviewedToday: number;
  reviewsToday: number;
  totalReviews: number;
  /** Share of cards mastered, 0–100. */
  masteredPercent: number;
  /** Share of cards studied at least once, 0–100. */
  studiedPercent: number;
  /** Share of reviews not rated Again, 0–100 (null when no reviews). */
  retention: number | null;
};

export function overview(cards: StatCard[], logs: StatLog[], now: Date): Overview {
  const endToday = endOfLocalDay(now).getTime();
  const startToday = startOfLocalDay(now).getTime();
  const total = cards.length;
  const mastered = cards.filter(isMastered).length;
  const studied = cards.filter((c) => c.reps > 0).length;
  const todayLogs = logs.filter((l) => new Date(l.reviewed_at).getTime() >= startToday);
  const correct = logs.filter((l) => l.rating > 1).length;
  return {
    totalCards: total,
    newCards: cards.filter((c) => c.state === CardState.New).length,
    studiedCards: studied,
    masteredCards: mastered,
    dueToday: cards.filter((c) => c.state !== CardState.New && new Date(c.due).getTime() < endToday).length,
    reviewedToday: new Set(todayLogs.map((l) => l.card_id)).size,
    reviewsToday: todayLogs.length,
    totalReviews: logs.length,
    masteredPercent: total ? Math.round((mastered / total) * 100) : 0,
    studiedPercent: total ? Math.round((studied / total) * 100) : 0,
    retention: logs.length ? Math.round((correct / logs.length) * 100) : null,
  };
}
