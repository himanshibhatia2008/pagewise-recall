// Pure, shared rules for AI flashcard generation: options, source-text selection, cleanup.
import type { PageText } from "@/lib/pdf/rules";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const LANGUAGES = ["en", "hi"] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_LABELS: Record<Language, string> = { en: "English", hi: "Hindi (हिन्दी)" };

export const MIN_CARDS = 1;
export const MAX_CARDS = 40;
/** Max characters of PDF text sent to the AI in one request (~15k tokens). */
export const MAX_SOURCE_CHARS = 60_000;
/** Pages shorter than this still get at least this many characters when trimming. */
const MIN_CHARS_PER_PAGE = 400;

export type GeneratedCard = {
  question: string;
  answer: string;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  sourcePage: number | null;
};

export type GenerateOptions = {
  materialId: string;
  count: number;
  difficulty: Difficulty;
  language: Language;
  scope: "all" | "topic";
  topic?: string | undefined;
  subject?: string | undefined;
};

export function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 10;
  return Math.min(MAX_CARDS, Math.max(MIN_CARDS, Math.round(n)));
}

function keywords(topic: string): string[] {
  return topic
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);
}

function countMatches(text: string, words: string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const w of words) {
    let i = lower.indexOf(w);
    while (i !== -1) {
      n++;
      i = lower.indexOf(w, i + w.length);
    }
  }
  return n;
}

export type SourceSelection = { text: string; pagesUsed: number[]; truncated: boolean };

function render(pages: PageText[]): string {
  return pages.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join("\n\n");
}

/**
 * Pick the PDF text to send to the AI, tagged with [Page N] markers.
 * - Topic scope keeps pages that mention the topic (plus their neighbours); falls back to all pages.
 * - Text over the budget is trimmed evenly per page so the whole document stays represented.
 */
export function selectSourceText(
  allPages: PageText[],
  opts: { scope: "all" | "topic"; topic?: string | undefined },
  maxChars = MAX_SOURCE_CHARS,
): SourceSelection {
  let pages = allPages.filter((p) => p.text.trim().length > 0);
  if (opts.scope === "topic" && opts.topic?.trim()) {
    const words = keywords(opts.topic);
    if (words.length) {
      const hits = new Set<number>();
      pages.forEach((p, i) => {
        if (countMatches(p.text, words) > 0) {
          hits.add(i);
          if (i > 0) hits.add(i - 1);
          if (i < pages.length - 1) hits.add(i + 1);
        }
      });
      if (hits.size > 0) pages = pages.filter((_, i) => hits.has(i));
    }
  }

  const full = render(pages);
  if (full.length <= maxChars) {
    return { text: full, pagesUsed: pages.map((p) => p.pageNumber), truncated: false };
  }

  // Too long: give every page an even share, but drop pages evenly if even the minimum doesn't fit.
  const overhead = 20;
  let kept = pages;
  const maxPages = Math.max(1, Math.floor(maxChars / (MIN_CHARS_PER_PAGE + overhead)));
  if (kept.length > maxPages) {
    const step = kept.length / maxPages;
    kept = Array.from({ length: maxPages }, (_, i) => pages[Math.floor(i * step)]!).filter(Boolean);
  }
  const share = Math.floor(maxChars / kept.length) - overhead;
  const trimmed = kept.map((p) => ({ pageNumber: p.pageNumber, text: p.text.slice(0, share) }));
  return { text: render(trimmed).slice(0, maxChars), pagesUsed: kept.map((p) => p.pageNumber), truncated: true };
}

/** Normalise a question for duplicate detection (case, punctuation, spacing). */
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop cards whose question repeats an earlier card or one in `existing`. Keeps the first occurrence. */
export function dedupeCards<T extends { question: string }>(cards: T[], existing: string[] = []): T[] {
  const seen = new Set(existing.map(normalizeQuestion));
  const out: T[] = [];
  for (const c of cards) {
    const key = normalizeQuestion(c.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Keep a page number only if it's one of the pages actually sent to the AI. */
export function validSourcePage(page: unknown, pagesUsed: number[]): number | null {
  return typeof page === "number" && Number.isInteger(page) && pagesUsed.includes(page) ? page : null;
}
