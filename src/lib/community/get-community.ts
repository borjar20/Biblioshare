import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getInteractionSummary, type InteractionComment } from "@/lib/social/interactions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CommunityReview = {
  id: string;
  author: string;
  initials: string;
  finishedOn: string; // ISO date
  rating: number | null; // 1–10
  text: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
};

export type Community = {
  avgRating: number | null; // 1–10, un decimal; null si nadie ha puntuado
  ratingCount: number;
  distribution: number[]; // porcentajes [5★, 4★, 3★, 2★, 1★]
  reviews: CommunityReview[];
};

const MAX_REVIEWS = 10;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// Agregados reales de la comunidad para una ficha: notas desde
// library_entries y reseñas desde diary_entries (con autor de profiles).
// La visibilidad la resuelve RLS: solo se ven filas de perfiles públicos
// (más las propias del que mira), así que aquí no hay filtro extra.
export async function getCommunity(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string
): Promise<Community> {
  const { data: entries } = await supabase
    .from("library_entries")
    .select("id, rating")
    .eq("item_type", itemType)
    .eq("item_id", itemId);

  const ratings = (entries ?? [])
    .map((e) => e.rating)
    .filter((r): r is number => r !== null);

  let avgRating: number | null = null;
  // Índice 0 = 5★ … índice 4 = 1★ (mismo orden que renderiza el panel).
  const distribution = [0, 0, 0, 0, 0];
  if (ratings.length > 0) {
    avgRating =
      Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
    for (const r of ratings) {
      const stars = Math.min(5, Math.max(1, Math.ceil(r / 2)));
      distribution[5 - stars] += 1;
    }
    for (let i = 0; i < distribution.length; i++) {
      distribution[i] = Math.round((distribution[i] / ratings.length) * 100);
    }
  }

  // Reseñas: pases de diario con texto, de cualquier entrada de este ítem.
  const entryIds = (entries ?? []).map((e) => e.id);
  let reviews: CommunityReview[] = [];
  if (entryIds.length > 0) {
    const { data: diaryRows } = await supabase
      .from("diary_entries")
      .select("id, user_id, finished_on, rating, review")
      .in("library_entry_id", entryIds)
      .not("review", "is", null)
      // Un pase abierto no es una reseña: todavía no ha terminado, así que
      // no debe verlo la comunidad.
      .not("finished_on", "is", null)
      // Una reseña privada es de su autor y de nadie más: la migración
      // 20260714_passes.sql convirtió las notas privadas de
      // library_entries.notes en pases con is_public = false, y ninguna
      // consulta las filtraba — se estaban publicando en la pestaña
      // Comunidad. Este filtro es el arreglo.
      .eq("is_public", true)
      .order("finished_on", { ascending: false })
      .limit(MAX_REVIEWS);

    // El filtro anterior garantiza finished_on no nulo; se narrowa aquí
    // porque Supabase no infiere el tipo a partir de la query.
    const rows = (diaryRows ?? []).filter(
      (r): r is typeof r & { finished_on: string } =>
        r.finished_on !== null && (r.review ?? "").trim() !== ""
    );

    if (rows.length > 0) {
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username, display_name")
        .in("user_id", userIds);

      const nameByUser = new Map(
        (profiles ?? []).map((p) => [p.user_id, p.display_name || p.username])
      );

      reviews = rows.map((r) => {
        const author = nameByUser.get(r.user_id) ?? "—";
        return {
          id: r.id,
          author,
          initials: initials(author) || "?",
          finishedOn: r.finished_on,
          rating: r.rating,
          text: (r.review ?? "").trim(),
          reactionCount: 0,
          viewerReacted: false,
          commentCount: 0,
          comments: [],
        };
      });

      const summaries = await getInteractionSummary(
        supabase,
        "diary_entry",
        reviews.map((r) => r.id),
      );
      reviews = reviews.map((r) => ({ ...r, ...summaries.get(r.id) }));
    }
  }

  return { avgRating, ratingCount: ratings.length, distribution, reviews };
}
