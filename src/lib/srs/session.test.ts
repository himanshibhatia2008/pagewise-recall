import { describe, expect, it } from "vitest";

import { newCardSchedule, scheduleReview } from "./scheduler";
import { applyRating, canRate, expectedReps, frontier, type SessionEntry } from "./session";

const now = new Date("2026-03-01T09:00:00Z");
let n = 0;
const key = () => `k${++n}`;
const mk = (id: string) => ({ id, ...newCardSchedule(now) });
type C = ReturnType<typeof mk>;

function start(ids: string[]): SessionEntry<C>[] {
  return ids.map((id) => ({ key: key(), card: mk(id), reviewId: key() }));
}

describe("revision session", () => {
  it("Again requeues the card at the end of the session", () => {
    let e = start(["a", "b"]);
    e = applyRating(e, 0, 1, scheduleReview(e[0]!.card, 1, now).next, now, key);
    expect(e.map((x) => x.card.id)).toEqual(["a", "b", "a"]);
    expect(frontier(e)).toBe(1);
  });

  it("Easy does not requeue", () => {
    let e = start(["a", "b"]);
    e = applyRating(e, 0, 4, scheduleReview(e[0]!.card, 4, now).next, now, key);
    expect(e).toHaveLength(2);
  });

  it("re-rating keeps the same review id and removes the pending retry", () => {
    let e = start(["a", "b"]);
    const reviewId = e[0]!.reviewId;
    e = applyRating(e, 0, 1, scheduleReview(e[0]!.card, 1, now).next, now, key);
    expect(expectedReps(e[0]!)).toBe(1); // card already saved once
    e = applyRating(e, 0, 4, scheduleReview(e[0]!.card, 4, now).next, now, key);
    expect(e.map((x) => x.card.id)).toEqual(["a", "b"]);
    expect(e[0]!.reviewId).toBe(reviewId);
    expect(e[0]!.rating).toBe(4);
    expect(e[0]!.after!.reps).toBe(1); // computed from the original card, not stacked
  });

  it("locks an earlier rating once a later review of the same card is rated", () => {
    let e = start(["a"]);
    e = applyRating(e, 0, 1, scheduleReview(e[0]!.card, 1, now).next, now, key);
    expect(canRate(e, 0)).toBe(true);
    e = applyRating(e, 1, 3, scheduleReview(e[1]!.card, 3, now).next, now, key);
    expect(canRate(e, 0)).toBe(false);
    expect(canRate(e, 1)).toBe(true);
  });
});
