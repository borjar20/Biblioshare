import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { groupIdsByType } from "@/lib/catalog/group-ids-by-type";
import type { Challenge, ChallengeProgress } from "./types";
import { countForChallenge, type CompletedItem } from "./match";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type DiaryRow = {
  finished_on: string;
  library_entries: { item_type: ItemType; item_id: string };
};

// Computes progress for a set of challenges in one pass. Reads the user's
// finished diary entries within the challenges' combined date span, then
// enriches them with genres / saga memberships only when some challenge needs
// that criterion — a plain "N of any type" challenge costs a single query. The
// matching itself is the pure countForChallenge (src/lib/challenges/match.ts).
// See docs/REQUIREMENTS.md §7.10.
export async function getChallengeProgress(
  supabase: SupabaseServerClient,
  userId: string,
  challenges: Challenge[]
): Promise<ChallengeProgress[]> {
  if (challenges.length === 0) return [];

  const spanStart = challenges.reduce(
    (min, c) => (c.startDate < min ? c.startDate : min),
    challenges[0].startDate
  );
  const spanEnd = challenges.reduce(
    (max, c) => (c.endDate > max ? c.endDate : max),
    challenges[0].endDate
  );

  const { data: diary, error } = await supabase
    .from("diary_entries")
    .select("finished_on, library_entries!inner(item_type, item_id)")
    .eq("user_id", userId)
    .gte("finished_on", spanStart)
    .lte("finished_on", spanEnd);

  if (error) throw error;

  const rows = (diary ?? []) as unknown as DiaryRow[];
  const refs = rows.map((row) => ({
    itemType: row.library_entries.item_type,
    itemId: row.library_entries.item_id,
  }));

  const needsGenres = challenges.some((c) => c.criteria.genre);
  const needsSagas = challenges.some((c) => c.criteria.sagaId);

  const [genresByKey, sagasByKey] = await Promise.all([
    needsGenres ? loadGenres(supabase, refs) : Promise.resolve(new Map<string, string[]>()),
    needsSagas ? loadSagaIds(supabase, refs) : Promise.resolve(new Map<string, string[]>()),
  ]);

  const items: CompletedItem[] = rows.map((row) => {
    const key = `${row.library_entries.item_type}:${row.library_entries.item_id}`;
    return {
      itemType: row.library_entries.item_type,
      itemId: row.library_entries.item_id,
      finishedOn: row.finished_on,
      genres: genresByKey.get(key) ?? [],
      sagaIds: sagasByKey.get(key) ?? [],
    };
  });

  return challenges.map((challenge) => {
    const rawCompleted = countForChallenge(items, challenge);
    return {
      challenge,
      rawCompleted,
      completed: Math.min(rawCompleted, challenge.targetCount),
    };
  });
}

// Genres live per catalog table (books/movies/series). Fan out one query per
// type that actually has ids — the idsByType pattern shared with the queue.
async function loadGenres(
  supabase: SupabaseServerClient,
  refs: Array<{ itemType: ItemType; itemId: string }>
): Promise<Map<string, string[]>> {
  const byType = groupIdsByType(refs);
  const map = new Map<string, string[]>();

  const [books, movies, series] = await Promise.all([
    byType.book.length
      ? supabase.from("books").select("id, genres").in("id", byType.book)
      : Promise.resolve({ data: [] }),
    byType.movie.length
      ? supabase.from("movies").select("id, genres").in("id", byType.movie)
      : Promise.resolve({ data: [] }),
    byType.series.length
      ? supabase.from("series").select("id, genres").in("id", byType.series)
      : Promise.resolve({ data: [] }),
  ]);

  for (const row of books.data ?? []) map.set(`book:${row.id}`, row.genres ?? []);
  for (const row of movies.data ?? []) map.set(`movie:${row.id}`, row.genres ?? []);
  for (const row of series.data ?? []) map.set(`series:${row.id}`, row.genres ?? []);

  return map;
}

// Saga memberships via saga_items (polymorphic item_type+item_id). One item can
// belong to more than one saga, so values accumulate.
async function loadSagaIds(
  supabase: SupabaseServerClient,
  refs: Array<{ itemType: ItemType; itemId: string }>
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (refs.length === 0) return map;

  const itemIds = [...new Set(refs.map((r) => r.itemId))];
  const { data, error } = await supabase
    .from("saga_items")
    .select("saga_id, item_type, item_id")
    .in("item_id", itemIds);

  if (error) throw error;

  for (const row of data ?? []) {
    const key = `${row.item_type}:${row.item_id}`;
    const list = map.get(key) ?? [];
    list.push(row.saga_id);
    map.set(key, list);
  }
  return map;
}
