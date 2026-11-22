// Browser data access for Smart Revision. Every query runs as the signed-in student,
// and row-level security keeps each student's rows private.
import { queryOptions, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Deck = Tables<"decks">;
export type Flashcard = Tables<"flashcards">;
export type MaterialSummary = Omit<Tables<"study_materials">, "pages">;
export type ReviewLogRow = Pick<
  Tables<"review_logs">,
  "id" | "card_id" | "rating" | "state_before" | "state_after" | "reviewed_at" | "scheduled_days"
>;

const PAGE = 1000;

/** Read every row of a query in pages of 1000 (the API's per-request cap). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export const keys = {
  materials: ["materials"] as const,
  decks: ["decks"] as const,
  cards: ["cards"] as const,
  logs: ["logs"] as const,
  recent: ["recent-activity"] as const,
  profile: ["profile"] as const,
};

export const materialsQuery = queryOptions({
  queryKey: keys.materials,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("study_materials")
      .select("id, user_id, file_name, file_size, page_count, text_page_count, word_count, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as MaterialSummary[];
  },
});

export const decksQuery = queryOptions({
  queryKey: keys.decks,
  queryFn: async () => {
    const { data, error } = await supabase.from("decks").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const cardsQuery = queryOptions({
  queryKey: keys.cards,
  queryFn: () =>
    fetchAll<Flashcard>((from, to) =>
      supabase.from("flashcards").select("*").order("created_at", { ascending: true }).order("id").range(from, to),
    ),
});

export const logsQuery = queryOptions({
  queryKey: keys.logs,
  queryFn: () =>
    fetchAll<ReviewLogRow>((from, to) =>
      supabase
        .from("review_logs")
        .select("id, card_id, rating, state_before, state_after, reviewed_at, scheduled_days")
        .order("reviewed_at", { ascending: true })
        .order("id")
        .range(from, to),
    ),
});

export const recentActivityQuery = queryOptions({
  queryKey: keys.recent,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("review_logs")
      .select("id, rating, reviewed_at, due_after, flashcards(question, subject)")
      .order("reviewed_at", { ascending: false })
      .limit(8);
    if (error) throw new Error(error.message);
    return data;
  },
});

export const profileQuery = queryOptions({
  queryKey: keys.profile,
  queryFn: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const { data } = await supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();
    return { email: auth.user.email ?? "", displayName: data?.display_name ?? auth.user.email?.split("@")[0] ?? "Student" };
  },
});

export async function fetchMaterialPages(id: string) {
  const { data, error } = await supabase.from("study_materials").select("pages").eq("id", id).single();
  if (error) throw new Error(error.message);
  return (Array.isArray(data.pages) ? data.pages : []) as unknown as { pageNumber: number; text: string }[];
}

/** Cards, decks and review history together — what the dashboard, daily and progress pages need. */
export function useStudyData() {
  const cards = useQuery(cardsQuery);
  const decks = useQuery(decksQuery);
  const logs = useQuery(logsQuery);
  return {
    cards: cards.data ?? [],
    decks: decks.data ?? [],
    logs: logs.data ?? [],
    isLoading: cards.isLoading || decks.isLoading || logs.isLoading,
    error: cards.error ?? decks.error ?? logs.error,
    refetch: () => Promise.all([cards.refetch(), decks.refetch(), logs.refetch()]),
  };
}
