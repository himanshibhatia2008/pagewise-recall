import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { PageText } from "@/lib/pdf/rules";

import { DIFFICULTIES, LANGUAGES, MAX_CARDS, selectSourceText, type GeneratedCard } from "./generation";

const baseInput = z.object({
  materialId: z.string().uuid(),
  difficulty: z.enum(DIFFICULTIES),
  language: z.enum(LANGUAGES),
  scope: z.enum(["all", "topic"]),
  topic: z.string().max(200).optional(),
  subject: z.string().max(120).optional(),
  avoid: z.array(z.string().max(500)).max(200).default([]),
});

export type GenerateResult =
  | { ok: true; cards: GeneratedCard[]; subject: string; insufficient: boolean; truncated: boolean }
  | { ok: false; error: string };

async function loadPages(
  supabase: SupabaseClient<Database>,
  materialId: string,
): Promise<PageText[] | null> {
  const { data, error } = await supabase.from("study_materials").select("pages").eq("id", materialId).maybeSingle();
  if (error || !data) return null;
  return Array.isArray(data.pages) ? (data.pages as unknown as PageText[]) : [];
}

export const generateFlashcards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => baseInput.extend({ count: z.number().int().min(1).max(MAX_CARDS) }).parse(input))
  .handler(async ({ data, context }): Promise<GenerateResult> => {
    const pages = await loadPages(context.supabase, data.materialId);
    if (!pages) return { ok: false, error: "We couldn't find that study material. It may have been deleted." };
    const source = selectSourceText(pages, { scope: data.scope, topic: data.topic });
    if (!source.text.trim()) return { ok: false, error: "This PDF has no readable text to make flashcards from." };
    if (data.scope === "topic" && !data.topic?.trim()) return { ok: false, error: "Type the topic you want cards about." };

    const { generateCards, GenerationError } = await import("./ai.server");
    try {
      const res = await generateCards({
        sourceText: source.text,
        pagesUsed: source.pagesUsed,
        count: data.count,
        difficulty: data.difficulty,
        language: data.language,
        topic: data.scope === "topic" ? data.topic : undefined,
        subject: data.subject,
        avoid: data.avoid,
      });
      return { ok: true, ...res, truncated: source.truncated };
    } catch (err) {
      if (err instanceof GenerationError) return { ok: false, error: err.message };
      console.error("[flashcards] generate failed", err);
      return { ok: false, error: "Something went wrong while generating flashcards. Please try again." };
    }
  });

export const regenerateFlashcard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    baseInput
      .extend({ replace: z.object({ question: z.string().max(1000), answer: z.string().max(2000), topic: z.string().max(200) }) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GenerateResult> => {
    const pages = await loadPages(context.supabase, data.materialId);
    if (!pages) return { ok: false, error: "We couldn't find that study material. It may have been deleted." };
    const topic = data.replace.topic || (data.scope === "topic" ? data.topic : undefined);
    const source = selectSourceText(pages, { scope: topic ? "topic" : "all", topic });

    const { generateCards, GenerationError } = await import("./ai.server");
    try {
      const res = await generateCards({
        sourceText: source.text,
        pagesUsed: source.pagesUsed,
        count: 1,
        difficulty: data.difficulty,
        language: data.language,
        topic: topic ? `${topic} (write a new, better card that replaces: "${data.replace.question}")` : undefined,
        subject: data.subject,
        avoid: [data.replace.question, ...data.avoid],
      });
      return { ok: true, ...res, truncated: source.truncated };
    } catch (err) {
      if (err instanceof GenerationError) return { ok: false, error: err.message };
      console.error("[flashcards] regenerate failed", err);
      return { ok: false, error: "Couldn't regenerate this card. Please try again." };
    }
  });
