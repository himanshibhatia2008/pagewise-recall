// Server-only: prompts and AI calls for flashcard generation.
// Uses OpenRouter when OPENROUTER_API_KEY is set, otherwise the Lovable AI Gateway.
import { GatewayError, generateResponse } from "@lovable.dev/ai-gateway";

import {
  dedupeCards,
  validSourcePage,
  type Difficulty,
  type GeneratedCard,
  type Language,
} from "./generation";

const MODEL = "openai/gpt-6-astra";
const OPENROUTER_MODEL = "baidu/ernie-5.5-flash-preview:free";

const DIFFICULTY_GUIDE: Record<Difficulty, string> = {
  easy: "Easy: direct recall of definitions, names and single facts stated plainly in the text.",
  medium:
    "Medium: understanding — explain a concept, compare two ideas, or state a cause/effect from the text.",
  hard: "Hard: application and connection — multi-step reasoning, why/how questions, or linking several facts from the text.",
};

const cardSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "answer", "topic", "difficulty", "source_page"],
  properties: {
    question: { type: "string" },
    answer: { type: "string" },
    topic: { type: "string" },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
    source_page: { type: ["integer", "null"] },
  },
} as const;

const resultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "insufficient_content", "cards"],
  properties: {
    subject: { type: "string" },
    insufficient_content: { type: "boolean" },
    cards: { type: "array", items: cardSchema },
  },
} as const;

type RawCard = {
  question: string;
  answer: string;
  topic: string;
  difficulty: Difficulty;
  source_page: number | null;
};
type RawResult = { subject: string; insufficient_content: boolean; cards: RawCard[] };

function systemPrompt(language: Language) {
  const lang =
    language === "hi"
      ? "Write every question, answer and topic in Hindi using Devanagari script. Keep standard technical terms, formulas and proper nouns in their usual form (English in brackets is fine when it helps)."
      : "Write every question, answer and topic in clear English.";
  return [
    "You are an expert teacher who writes Anki-style revision flashcards for students.",
    "Use ONLY facts stated in the provided source text. Never invent facts, numbers or examples that are not in the text.",
    "Identify the important topics, key definitions, concepts and facts, and write concise question–answer cards.",
    "Rules:",
    "- One idea per card. Questions under 25 words; answers 1–3 short sentences (under 60 words).",
    "- Questions must make sense on their own without the source (no 'according to the text', no 'on this page').",
    "- No duplicate or near-duplicate questions.",
    "- Skip irrelevant content: headers, footers, page numbers, author names, table of contents, references, exercises without answers.",
    "- source_page is the number from the nearest preceding [Page N] marker where the answer is found, or null if unclear.",
    "- topic is a short label (2–5 words) for the concept the card covers.",
    "- subject is the overall academic subject of the material (e.g. Biology, Modern History).",
    "- If the text doesn't contain enough distinct facts for the requested number, return fewer cards and set insufficient_content to true.",
    lang,
  ].join("\n");
}

export class GenerationError extends Error {}

function friendlyError(err: unknown): GenerationError {
  if (err instanceof GatewayError) {
    console.error("[flashcards] gateway error", err.code, err.httpStatus, err.ids);
    switch (err.code) {
      case "rate_limited":
        return new GenerationError("The AI is busy right now. Please wait a minute and try again.");
      case "payment_required":
        return new GenerationError(
          "AI credits for this app have run out. The app owner needs to add credits.",
        );
      case "timeout":
      case "network_error":
        return new GenerationError(
          "The AI took too long to respond. Try fewer cards or a narrower topic.",
        );
      default:
        return new GenerationError(
          "The AI couldn't generate flashcards right now. Please try again.",
        );
    }
  }
  console.error("[flashcards] unexpected error", err);
  return new GenerationError("Something went wrong while generating flashcards. Please try again.");
}

async function callOpenRouter(
  apiKey: string,
  instructions: string,
  userText: string,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "BrainStack",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: userText },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "flashcards", strict: true, schema: resultSchema },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    console.error("[flashcards] openrouter network error", err);
    throw new GenerationError(
      "The AI took too long to respond. Try fewer cards or a narrower topic.",
    );
  }
  if (!res.ok) {
    console.error("[flashcards] openrouter error", res.status, (await res.text()).slice(0, 500));
    if (res.status === 429)
      throw new GenerationError("The AI is busy right now. Please wait a minute and try again.");
    if (res.status === 402)
      throw new GenerationError(
        "AI credits for this app have run out. The app owner needs to add credits.",
      );
    throw new GenerationError("The AI couldn't generate flashcards right now. Please try again.");
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  };
  const message = data.choices?.[0]?.message;
  if (message?.refusal) throw new GenerationError("The AI declined to make cards from this text.");
  // Some models wrap JSON in ``` fences even when asked for a schema.
  return (message?.content ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
}

async function callModel(instructions: string, userText: string): Promise<RawResult> {
  const openRouterKey = process.env["OPENROUTER_API_KEY"];
  const text = openRouterKey
    ? await callOpenRouter(openRouterKey, instructions, userText)
    : await callLovable(instructions, userText);
  try {
    const parsed = JSON.parse(text) as RawResult;
    if (!Array.isArray(parsed.cards)) throw new Error("no cards");
    return parsed;
  } catch {
    console.error("[flashcards] unparseable AI output", text.slice(0, 500));
    throw new GenerationError("The AI returned an unexpected answer. Please try again.");
  }
}

async function callLovable(instructions: string, userText: string): Promise<string> {
  let response;
  try {
    response = await generateResponse({
      model: MODEL,
      instructions,
      input: [{ role: "user", content: userText }],
      reasoning: { effort: "low" },
      text: {
        format: { type: "json_schema", name: "flashcards", strict: true, schema: resultSchema },
      },
    });
  } catch (err) {
    throw friendlyError(err);
  }
  let text = "";
  for (const item of response.output ?? []) {
    if (item.type === "message") {
      for (const part of item.content) {
        if (part.type === "output_text") text += part.text;
        if (part.type === "refusal")
          throw new GenerationError("The AI declined to make cards from this text.");
      }
    }
  }
  return text;
}

function clean(
  raw: RawCard[],
  subject: string,
  pagesUsed: number[],
  fallback: Difficulty,
): GeneratedCard[] {
  return raw
    .map((c) => ({
      question: (c.question ?? "").trim(),
      answer: (c.answer ?? "").trim(),
      topic: (c.topic ?? "").trim().slice(0, 80),
      subject,
      difficulty: (["easy", "medium", "hard"] as const).includes(c.difficulty)
        ? c.difficulty
        : fallback,
      sourcePage: validSourcePage(c.source_page, pagesUsed),
    }))
    .filter((c) => c.question && c.answer);
}

export async function generateCards(args: {
  sourceText: string;
  pagesUsed: number[];
  count: number;
  difficulty: Difficulty;
  language: Language;
  topic?: string | undefined;
  subject?: string | undefined;
  avoid: string[];
}): Promise<{ cards: GeneratedCard[]; subject: string; insufficient: boolean }> {
  const focus = args.topic?.trim()
    ? `Only make cards about this topic: "${args.topic.trim()}". Ignore unrelated material.`
    : "Cover the most important ideas across the whole text, spread over its main topics.";
  const user = [
    `Create exactly ${args.count} flashcards.`,
    `Difficulty for every card — ${DIFFICULTY_GUIDE[args.difficulty]}`,
    focus,
    args.subject?.trim()
      ? `The subject is "${args.subject.trim()}"; use it as the subject value.`
      : "",
    args.avoid.length
      ? `Do not repeat these existing questions:\n${args.avoid
          .slice(0, 80)
          .map((q) => `- ${q}`)
          .join("\n")}`
      : "",
    "Return JSON.",
    "SOURCE TEXT:",
    args.sourceText,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await callModel(systemPrompt(args.language), user);
  const subject = args.subject?.trim() || result.subject?.trim() || "General";
  const cards = dedupeCards(
    clean(result.cards, subject, args.pagesUsed, args.difficulty),
    args.avoid,
  ).slice(0, args.count);
  if (cards.length === 0) {
    throw new GenerationError(
      args.topic?.trim()
        ? `We couldn't find enough about "${args.topic.trim()}" in this PDF. Try another topic or the entire PDF.`
        : "The AI couldn't find clear facts to turn into flashcards in this PDF.",
    );
  }
  return { cards, subject, insufficient: result.insufficient_content || cards.length < args.count };
}
