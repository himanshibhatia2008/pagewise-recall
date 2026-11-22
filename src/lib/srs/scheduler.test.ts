import { describe, expect, it } from "vitest";

import {
  CardState,
  formatInterval,
  isMastered,
  newCardSchedule,
  previewIntervals,
  scheduleReview,
} from "./scheduler";

const T0 = new Date("2026-03-01T09:00:00Z");
const MIN = 60_000;
const DAY = 86_400_000;

describe("FSRS scheduling", () => {
  it("Again on a new card schedules an early retry in 1 minute", () => {
    const { next } = scheduleReview(newCardSchedule(T0), 1, T0);
    expect(new Date(next.due).getTime() - T0.getTime()).toBe(1 * MIN);
    expect(next.state).toBe(CardState.Learning);
  });

  it("orders intervals Again < Hard < Good < Easy for a new card", () => {
    const p = previewIntervals(newCardSchedule(T0), T0);
    expect(p[1]).toBeLessThan(p[2]);
    expect(p[2]).toBeLessThan(p[3]);
    expect(p[3]).toBeLessThan(p[4]);
  });

  it("Easy on a new card graduates it straight to review with a multi-day interval", () => {
    const { next } = scheduleReview(newCardSchedule(T0), 4, T0);
    expect(next.state).toBe(CardState.Review);
    expect(next.scheduled_days).toBeGreaterThanOrEqual(1);
  });

  it("intervals grow with repeated Good ratings, using each card's own history", () => {
    let card = newCardSchedule(T0);
    let now = T0;
    const gaps: number[] = [];
    for (let i = 0; i < 5; i++) {
      card = scheduleReview(card, 3, now).next;
      const due = new Date(card.due);
      gaps.push(due.getTime() - now.getTime());
      now = due;
    }
    for (let i = 2; i < gaps.length; i++) expect(gaps[i]!).toBeGreaterThan(gaps[i - 1]!);
    expect(card.reps).toBe(5);
  });

  it("Again on a review card counts a lapse, relearns and lowers stability", () => {
    let card = newCardSchedule(T0);
    let now = T0;
    for (let i = 0; i < 3; i++) {
      card = scheduleReview(card, 3, now).next;
      now = new Date(card.due);
    }
    expect(card.state).toBe(CardState.Review);
    const before = card.stability;
    const { next } = scheduleReview(card, 1, now);
    expect(next.lapses).toBe(card.lapses + 1);
    expect(next.state).toBe(CardState.Relearning);
    expect(next.stability).toBeLessThan(before);
    expect(new Date(next.due).getTime() - now.getTime()).toBeLessThan(DAY);
  });

  it("reports elapsed days since the last review", () => {
    const first = scheduleReview(newCardSchedule(T0), 4, T0).next;
    const later = new Date(T0.getTime() + 3 * DAY);
    expect(scheduleReview(first, 3, later).elapsedDays).toBeCloseTo(3, 5);
  });
});

describe("mastery", () => {
  it("needs review state with an interval of at least 21 days", () => {
    expect(isMastered({ state: CardState.Review, scheduled_days: 21 })).toBe(true);
    expect(isMastered({ state: CardState.Review, scheduled_days: 20 })).toBe(false);
    expect(isMastered({ state: CardState.Relearning, scheduled_days: 30 })).toBe(false);
  });
});

describe("formatInterval", () => {
  it("formats minutes, hours, days, months", () => {
    expect(formatInterval(MIN)).toBe("1 min");
    expect(formatInterval(10 * MIN)).toBe("10 min");
    expect(formatInterval(3 * 3_600_000)).toBe("3 h");
    expect(formatInterval(DAY)).toBe("1 day");
    expect(formatInterval(4 * DAY)).toBe("4 days");
    expect(formatInterval(60 * DAY)).toBe("2 mo");
  });
});
