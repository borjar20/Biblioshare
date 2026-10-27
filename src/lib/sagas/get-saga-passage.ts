import type { ItemType } from "@/lib/catalog/types";
import { getCurrentUser, type createClient } from "@/lib/supabase/server";
import type { SagaDetail } from "./get-saga-detail";
import { derivePassage, type CatalogSize, type PassRow, type Passage, type PassageInput } from "./passage";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Lectura de «Tu paso» (fase 2). Depende de la sesión: sin `use cache` (regla
// #437) y se monta detrás de <Suspense>. Filtra por user_id aunque RLS ya
// acote: «Tu paso» es TUYO, no lo que el que mira puede ver de otros.
export async function getSagaPassage(
  supabase: SupabaseServerClient,
  detail: SagaDetail,
  order: PassageInput["order"],
): Promise<Passage | null> {
  if (!detail.isAuthenticated) return null;
  const user = await getCurrentUser();
  if (!user) return null;

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const m of detail.groups.flatMap((g) => g.members)) idsByType[m.itemType].push(m.itemId);

  const passes: PassRow[] = [];
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from("passes")
        .select("item_id, status, rating, started_on, finished_on, created_at")
        .eq("user_id", user.id)
        .eq("item_type", type)
        .in("item_id", idsByType[type]);
      for (const r of data ?? []) {
        passes.push({
          itemType: type,
          itemId: r.item_id,
          status: r.status,
          rating: r.rating,
          startedOn: r.started_on,
          finishedOn: r.finished_on,
          createdAt: r.created_at,
        });
      }
    }),
  );
  if (passes.length === 0) return null;

  const withPass = (type: ItemType) => [
    ...new Set(passes.filter((r) => r.itemType === type).map((r) => r.itemId)),
  ];
  const bookIds = withPass("book");
  const movieIds = withPass("movie");
  const [books, movies] = await Promise.all([
    bookIds.length
      ? supabase.from("books").select("id, total_pages").in("id", bookIds)
      : Promise.resolve({ data: [] }),
    movieIds.length
      ? supabase.from("movies").select("id, duration_minutes").in("id", movieIds)
      : Promise.resolve({ data: [] }),
  ]);
  const sizes = new Map<string, CatalogSize>();
  for (const b of (books.data ?? []) as Array<{ id: string; total_pages: number | null }>)
    sizes.set(`book:${b.id}`, { pages: b.total_pages, minutes: null });
  for (const m of (movies.data ?? []) as Array<{ id: string; duration_minutes: number | null }>)
    sizes.set(`movie:${m.id}`, { pages: null, minutes: m.duration_minutes });

  return derivePassage({ passes, sizes, order });
}
