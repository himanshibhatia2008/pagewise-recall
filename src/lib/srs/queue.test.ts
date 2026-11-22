import { describe, expect, it } from "vitest";

import { NEW_CARDS_PER_DAY, buildDueQueue, buildEarlyQueue, newCardAllowance, shouldRequeue, type QueueCard } from "./queue";

const now = new Date(2026, 2, 10, 15, 0, 0);
const iso = (d: Date) => d.toISOString();
const at = (h: number, dayOffset = 0) => iso(new Date(2026, 2, 10 + dayOffset, h, 0, 0));

function card(id: string, state: number, due: string, created = at(8, -5)): QueueCard {
  return { id, state, due, created_at: created };
}

describe("today's revision queue", () => {
  it("includes due studied cards but never cards that aren't due yet", () => {
    const cards = [card("due", 2, at(9)), card("later", 2, at(18)), card("tomorrow", 2, at(9, 1))];
    expect(buildDueQueue(cards, [], now).map((c) => c.id)).toEqual(["due"]);
  });

  it("limits new cards to 20 per day, counting new cards already studied today", () => {
    const fresh = Array.from({ length: 30 }, (_, i) => card(`n${i}`, 0, at(8), iso(new Date(2026, 1, 1, 0, i))));
    expect(buildDueQueue(fresh, [], now)).toHaveLength(NEW_CARDS_PER_DAY);
    const logs = Array.from({ length: 5 }, (_, i) => ({ card_id: `old${i}`, state_before: 0, reviewed_at: at(10) }));
    expect(newCardAllowance(logs, now)).toBe(15);
    expect(buildDueQueue(fresh, logs, now)).toHaveLength(15);
  });

  it("ignores new cards studied on previous days for today's allowance", () => {
    const logs = [{ card_id: "x", state_before: 0, reviewed_at: at(10, -1) }];
    expect(newCardAllowance(logs, now)).toBe(20);
  });
});

describe("study early", () => {
  it("only pulls not-yet-due cards, soonest first", () => {
    const cards = [card("due", 2, at(9)), card("b", 2, at(9, 3)), card("a", 2, at(9, 1))];
    expect(buildEarlyQueue(cards, [], now).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("learning-step requeue", () => {
  it("brings a card back in the same session when it's due within 20 minutes", () => {
    expect(shouldRequeue(iso(new Date(now.getTime() + 10 * 60_000)), now)).toBe(true);
    expect(shouldRequeue(iso(new Date(now.getTime() + 2 * 86_400_000)), now)).toBe(false);
  });
});
