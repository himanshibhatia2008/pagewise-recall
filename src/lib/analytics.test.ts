import { describe, expect, it } from "vitest";

import { dailyActivity, overview, ratingBreakdown, subjectStats, upcomingDue, type StatCard, type StatLog } from "./analytics";

const now = new Date(2026, 2, 10, 15, 0, 0);
const at = (h: number, dayOffset = 0) => new Date(2026, 2, 10 + dayOffset, h).toISOString();
const c = (id: string, over: Partial<StatCard> = {}): StatCard => ({
  id,
  deck_id: "d",
  subject: "Biology",
  state: 2,
  due: at(9, 2),
  scheduled_days: 3,
  reps: 2,
  created_at: at(8, -10),
  ...over,
});

describe("overview", () => {
  it("counts due today, reviewed today, mastered and progress from real rows", () => {
    const cards = [
      c("a", { due: at(9) }),
      c("b", { due: at(22) }),
      c("m", { scheduled_days: 30 }),
      c("n", { state: 0, reps: 0, due: at(1) }),
    ];
    const logs: StatLog[] = [
      { card_id: "a", rating: 3, state_before: 2, reviewed_at: at(10) },
      { card_id: "a", rating: 1, state_before: 2, reviewed_at: at(11) },
      { card_id: "b", rating: 4, state_before: 2, reviewed_at: at(10, -1) },
    ];
    const o = overview(cards, logs, now);
    expect(o.totalCards).toBe(4);
    expect(o.dueToday).toBe(2); // new cards aren't "due"
    expect(o.reviewedToday).toBe(1);
    expect(o.reviewsToday).toBe(2);
    expect(o.masteredCards).toBe(1);
    expect(o.masteredPercent).toBe(25);
    expect(o.retention).toBe(67);
  });
});

describe("charts", () => {
  it("breaks down ratings", () => {
    const logs = [1, 3, 3, 4].map((r) => ({ card_id: "x", rating: r, state_before: 2, reviewed_at: at(9) }));
    expect(ratingBreakdown(logs)).toEqual({ 1: 1, 2: 0, 3: 2, 4: 1 });
  });

  it("buckets weekly activity by local day", () => {
    const logs = [
      { card_id: "x", rating: 3, state_before: 2, reviewed_at: at(9) },
      { card_id: "x", rating: 1, state_before: 2, reviewed_at: at(9, -6) },
      { card_id: "x", rating: 1, state_before: 2, reviewed_at: at(9, -7) },
    ];
    const week = dailyActivity(logs, now, 7);
    expect(week).toHaveLength(7);
    expect(week[6]!.good).toBe(1);
    expect(week[0]!.again).toBe(1);
    expect(week.reduce((s, d) => s + d.total, 0)).toBe(2);
  });

  it("puts overdue cards in today's upcoming bucket", () => {
    const up = upcomingDue([c("o", { due: at(9, -3) }), c("t", { due: at(9, 1) })], now, 7);
    expect(up[0]!.count).toBe(1);
    expect(up[1]!.count).toBe(1);
  });

  it("computes subject accuracy", () => {
    const s = subjectStats(
      [c("a"), c("b", { subject: "Physics" })],
      [
        { card_id: "a", rating: 3, state_before: 2, reviewed_at: at(9) },
        { card_id: "a", rating: 1, state_before: 2, reviewed_at: at(9) },
      ],
    );
    expect(s.find((r) => r.subject === "Biology")?.accuracy).toBe(50);
    expect(s.find((r) => r.subject === "Physics")?.accuracy).toBeNull();
  });
});
