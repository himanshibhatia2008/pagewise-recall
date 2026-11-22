// Pure rules for which cards go into a revision session.
import { CardState } from "./scheduler";

/** New cards introduced per day (Anki's default). */
export const NEW_CARDS_PER_DAY = 20;
/** Cards due again within this window (learning steps) come back later in the same session. */
export const REQUEUE_WINDOW_MS = 20 * 60_000;
/** Max cards pulled in when a student chooses to study early. */
export const STUDY_EARLY_LIMIT = 20;

export type QueueCard = { id: string; state: number; due: string; created_at: string };
export type QueueLog = { card_id: string; state_before: number; reviewed_at: string };

export function startOfLocalDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfLocalDay(now: Date): Date {
  const d = startOfLocalDay(now);
  d.setDate(d.getDate() + 1);
  return d;
}

/** Number of new cards first studied today (their first review happened today). */
export function newCardsStudiedToday(logs: QueueLog[], now: Date): number {
  const start = startOfLocalDay(now).getTime();
  const ids = new Set<string>();
  for (const l of logs) {
    if (l.state_before === CardState.New && new Date(l.reviewed_at).getTime() >= start) ids.add(l.card_id);
  }
  return ids.size;
}

export function newCardAllowance(logs: QueueLog[], now: Date, perDay = NEW_CARDS_PER_DAY): number {
  return Math.max(0, perDay - newCardsStudiedToday(logs, now));
}

const byDue = (a: QueueCard, b: QueueCard) => a.due.localeCompare(b.due);
const byCreated = (a: QueueCard, b: QueueCard) => a.created_at.localeCompare(b.created_at);

/** Studied cards whose due time has arrived. */
export function dueCards<T extends QueueCard>(cards: T[], now: Date): T[] {
  const t = now.getTime();
  return cards.filter((c) => c.state !== CardState.New && new Date(c.due).getTime() <= t).sort(byDue);
}

/** Studied cards due later today (not yet due right now). */
export function dueLaterToday<T extends QueueCard>(cards: T[], now: Date): T[] {
  const t = now.getTime();
  const end = endOfLocalDay(now).getTime();
  return cards
    .filter((c) => {
      const due = new Date(c.due).getTime();
      return c.state !== CardState.New && due > t && due < end;
    })
    .sort(byDue);
}

export function newCards<T extends QueueCard>(cards: T[]): T[] {
  return cards.filter((c) => c.state === CardState.New).sort(byCreated);
}

/** Today's session: every due card, then new cards up to the remaining daily allowance. */
export function buildDueQueue<T extends QueueCard>(cards: T[], logs: QueueLog[], now: Date): T[] {
  return [...dueCards(cards, now), ...newCards(cards).slice(0, newCardAllowance(logs, now))];
}

/** Study early: cards not yet due, soonest first; extra new cards if nothing is scheduled. */
export function buildEarlyQueue<T extends QueueCard>(
  cards: T[],
  logs: QueueLog[],
  now: Date,
  limit = STUDY_EARLY_LIMIT,
): T[] {
  const t = now.getTime();
  const upcoming = cards
    .filter((c) => c.state !== CardState.New && new Date(c.due).getTime() > t)
    .sort(byDue)
    .slice(0, limit);
  if (upcoming.length >= limit) return upcoming;
  const extraNew = newCards(cards).slice(newCardAllowance(logs, now), undefined);
  return [...upcoming, ...extraNew.slice(0, limit - upcoming.length)];
}

export function shouldRequeue(nextDueIso: string, now: Date): boolean {
  return new Date(nextDueIso).getTime() - now.getTime() <= REQUEUE_WINDOW_MS;
}
