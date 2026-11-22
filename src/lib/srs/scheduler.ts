// FSRS spaced-repetition scheduling. Pure functions over the card fields stored in the
// `flashcards` table, so the same rules run in tests, the browser and the server.
import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from "ts-fsrs";

export const RATINGS = [1, 2, 3, 4] as const;
export type RatingValue = (typeof RATINGS)[number];
export const RATING_LABELS: Record<RatingValue, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

/** FSRS card states, matching ts-fsrs and the `flashcards.state` column. */
export const CardState = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const;
export type CardStateValue = (typeof CardState)[keyof typeof CardState];

/** Target probability of remembering a card when it comes due. */
export const DESIRED_RETENTION = 0.9;
export const MAXIMUM_INTERVAL_DAYS = 36500;
/** A card counts as mastered once it is in review with an interval of at least 21 days (Anki's "mature"). */
export const MASTERED_INTERVAL_DAYS = 21;

/** Scheduling fields as stored on a flashcard row (ISO strings for dates). */
export type ScheduleFields = {
  state: number;
  due: string;
  stability: number;
  fsrs_difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  last_review: string | null;
};

export type ReviewOutcome = { next: ScheduleFields; elapsedDays: number };

const scheduler = fsrs(
  generatorParameters({
    request_retention: DESIRED_RETENTION,
    maximum_interval: MAXIMUM_INTERVAL_DAYS,
    enable_fuzz: false,
    enable_short_term: true,
  }),
);

function toCard(f: ScheduleFields): Card {
  const card: Card = {
    due: new Date(f.due),
    stability: f.stability,
    difficulty: f.fsrs_difficulty,
    scheduled_days: f.scheduled_days,
    learning_steps: f.learning_steps,
    reps: f.reps,
    lapses: f.lapses,
    state: f.state as Card["state"],
  };
  if (f.last_review) card.last_review = new Date(f.last_review);
  return card;
}

function fromCard(c: Card): ScheduleFields {
  return {
    state: c.state as number,
    due: c.due.toISOString(),
    stability: c.stability,
    fsrs_difficulty: c.difficulty,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

export function newCardSchedule(now: Date = new Date()): ScheduleFields {
  return fromCard(createEmptyCard(now));
}

/** Compute a card's next schedule after a rating, from its current stored fields. */
export function scheduleReview(card: ScheduleFields, rating: RatingValue, now: Date = new Date()): ReviewOutcome {
  const { card: next } = scheduler.next(toCard(card), now, rating as Grade);
  const elapsedDays = card.last_review
    ? Math.max(0, (now.getTime() - new Date(card.last_review).getTime()) / 86_400_000)
    : 0;
  return { next: fromCard(next), elapsedDays };
}

/** Time until the card would be due for each rating — shown on the rating buttons. */
export function previewIntervals(card: ScheduleFields, now: Date = new Date()): Record<RatingValue, number> {
  const out = {} as Record<RatingValue, number>;
  for (const r of RATINGS) {
    out[r] = new Date(scheduleReview(card, r, now).next.due).getTime() - now.getTime();
  }
  return out;
}

export function isMastered(card: Pick<ScheduleFields, "state" | "scheduled_days">): boolean {
  return card.state === CardState.Review && card.scheduled_days >= MASTERED_INTERVAL_DAYS;
}

/** Human-friendly interval: "1 min", "10 min", "3 h", "4 days", "2 mo", "1.5 yr". */
export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const hours = ms / 3_600_000;
  if (hours < 24) return `${Math.round(hours)} h`;
  const days = Math.round(ms / 86_400_000);
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"}`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, "")} yr`;
}

export const STATE_LABELS: Record<number, string> = {
  0: "New",
  1: "Learning",
  2: "Review",
  3: "Relearning",
};
