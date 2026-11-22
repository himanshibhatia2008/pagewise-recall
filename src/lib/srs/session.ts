// Pure state transitions for a revision session: rating, re-rating and learning-step requeue.
import { shouldRequeue } from "./queue";
import type { RatingValue, ScheduleFields } from "./scheduler";

export type SessionEntry<C extends ScheduleFields & { id: string }> = {
  key: string;
  card: C; // the card as it was before this review
  reviewId: string;
  rating?: RatingValue;
  after?: ScheduleFields;
};

/** Index of the first entry not rated yet (entries.length when the session is finished). */
export function frontier<C extends ScheduleFields & { id: string }>(entries: SessionEntry<C>[]): number {
  const i = entries.findIndex((e) => e.rating === undefined);
  return i === -1 ? entries.length : i;
}

/** A rating can be changed only while no later review of the same card has been rated in this session. */
export function canRate<C extends ScheduleFields & { id: string }>(entries: SessionEntry<C>[], index: number): boolean {
  const entry = entries[index];
  if (!entry) return false;
  return !entries.slice(index + 1).some((e) => e.card.id === entry.card.id && e.rating !== undefined);
}

/** Reps value the stored card must still have for this (re-)rating to apply. */
export function expectedReps<C extends ScheduleFields & { id: string }>(entry: SessionEntry<C>): number {
  return entry.after ? entry.after.reps : entry.card.reps;
}

/**
 * Record a rating on entry `index`. Re-rating replaces that entry's result (same review id, no duplicate),
 * drops any pending retry of the card queued by the old rating, and queues a retry if the card is due again soon.
 */
export function applyRating<C extends ScheduleFields & { id: string }>(
  entries: SessionEntry<C>[],
  index: number,
  rating: RatingValue,
  after: ScheduleFields,
  now: Date,
  newKey: () => string,
): SessionEntry<C>[] {
  const entry = entries[index];
  if (!entry) return entries;
  const updated = { ...entry, rating, after };
  const before = entries.slice(0, index);
  const rest = entries.slice(index + 1).filter((e) => !(e.card.id === entry.card.id && e.rating === undefined));
  const next = [...before, updated, ...rest];
  if (shouldRequeue(after.due, now)) {
    next.push({ key: newKey(), card: { ...entry.card, ...after }, reviewId: newKey() });
  }
  return next;
}
