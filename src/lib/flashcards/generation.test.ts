import { describe, expect, it } from "vitest";

import { clampCount, dedupeCards, selectSourceText, validSourcePage } from "./generation";

const pages = [
  { pageNumber: 1, text: "Introduction to cells and biology." },
  { pageNumber: 2, text: "Mitochondria are the powerhouse of the cell." },
  { pageNumber: 3, text: "Photosynthesis happens in chloroplasts." },
  { pageNumber: 4, text: "Newton's laws of motion." },
  { pageNumber: 5, text: "Gravity and orbits." },
];

describe("source text selection", () => {
  it("tags every page with a [Page N] marker for the entire PDF", () => {
    const s = selectSourceText(pages, { scope: "all" });
    expect(s.pagesUsed).toEqual([1, 2, 3, 4, 5]);
    expect(s.text).toContain("[Page 4]\nNewton's laws of motion.");
    expect(s.truncated).toBe(false);
  });

  it("topic scope keeps matching pages and their neighbours", () => {
    const s = selectSourceText(pages, { scope: "topic", topic: "photosynthesis" });
    expect(s.pagesUsed).toEqual([2, 3, 4]);
  });

  it("topic scope falls back to the whole PDF when nothing matches", () => {
    expect(selectSourceText(pages, { scope: "topic", topic: "volcanoes" }).pagesUsed).toHaveLength(5);
  });

  it("stays within the character budget for long PDFs while covering many pages", () => {
    const long = Array.from({ length: 50 }, (_, i) => ({ pageNumber: i + 1, text: "x".repeat(5000) }));
    const s = selectSourceText(long, { scope: "all" }, 20_000);
    expect(s.text.length).toBeLessThanOrEqual(20_000);
    expect(s.truncated).toBe(true);
    expect(s.pagesUsed.length).toBeGreaterThan(10);
  });
});

describe("cleanup", () => {
  it("removes duplicate questions ignoring case and punctuation, including existing deck questions", () => {
    const cards = [{ question: "What is a cell?" }, { question: "what is a CELL" }, { question: "Define osmosis." }];
    expect(dedupeCards(cards).map((c) => c.question)).toEqual(["What is a cell?", "Define osmosis."]);
    expect(dedupeCards(cards, ["Define osmosis"]).map((c) => c.question)).toEqual(["What is a cell?"]);
  });

  it("keeps Hindi text when normalising", () => {
    expect(dedupeCards([{ question: "कोशिका क्या है?" }, { question: "कोशिका क्या है" }])).toHaveLength(1);
  });

  it("only accepts page numbers that were sent to the AI", () => {
    expect(validSourcePage(3, [1, 2, 3])).toBe(3);
    expect(validSourcePage(9, [1, 2, 3])).toBeNull();
    expect(validSourcePage("2", [1, 2, 3])).toBeNull();
  });

  it("clamps card count to 1–40", () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(100)).toBe(40);
    expect(clampCount(12.4)).toBe(12);
  });
});
