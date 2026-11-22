import { CardState, isMastered } from "@/lib/srs/scheduler";

export type DeckStats = { total: number; newCount: number; due: number; mastered: number; nextDue: string | null };

/** Per-deck counts: total, new, due right now, mastered, and the next upcoming review time. */
export function deckStats(cards: { deck_id: string; state: number; due: string; scheduled_days: number }[], now: Date) {
  const map = new Map<string, DeckStats>();
  const t = now.getTime();
  for (const c of cards) {
    const s = map.get(c.deck_id) ?? { total: 0, newCount: 0, due: 0, mastered: 0, nextDue: null };
    s.total++;
    if (c.state === CardState.New) s.newCount++;
    else if (new Date(c.due).getTime() <= t) s.due++;
    else if (!s.nextDue || c.due < s.nextDue) s.nextDue = c.due;
    if (isMastered(c)) s.mastered++;
    map.set(c.deck_id, s);
  }
  return map;
}

export const emptyDeckStats: DeckStats = { total: 0, newCount: 0, due: 0, mastered: 0, nextDue: null };
