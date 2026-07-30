import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getInteractionSummary, type InteractionComment } from "@/lib/social/interactions";
import { resolveKnownMentions } from "@/lib/social/resolve-mentions";
import { formatEdition } from "@/lib/editions/edition-label";
import { latestRatingPerUser, type RatedPass } from "./latest-rating";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CommunityReview = {
  id: string;
  author: string;
  initials: string;
  finishedOn: string; // ISO date
  rating: number | null; // 1–10
  text: string;
  editionLabel: string | null;
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
  // Usernames @mencionados en `reviews` (texto + comentarios) que existen de
  // verdad — resuelto en UNA query (resolveKnownMentions) para que
  // CommunityPanel linkifique sin volver a tocar la BD.
  knownUsernames: string[];
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

// Resuelve las etiquetas de edición de un lote de ids en UNA consulta (no una
// por reseña). Las series no tienen tabla de ediciones.
async function loadEditionLabels(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  editionIds: string[]
): Promise<Map<string, string>> {
  if (editionIds.length === 0 || itemType === "series") return new Map();

  if (itemType === "book") {
    const { data } = await supabase
      .from("book_editions")
      .select("id, label, publisher, published_year, language, total_pages, isbn, cover_url, is_primary")
      .in("id", editionIds);
    return new Map(
      (data ?? []).map((r) => [
        r.id,
        formatEdition(
          {
            id: r.id,
            label: r.label,
            publisher: r.publisher,
            year: r.published_year,
            language: r.language,
            totalUnits: r.total_pages,
            isbn: r.isbn,
            coverUrl: r.cover_url,
            isPrimary: r.is_primary,
          },
          itemType
        ),
      ])
    );
  }

  const { data } = await supabase
    .from("movie_versions")
    .select("id, label, release_year, duration_minutes, is_primary")
    .in("id", editionIds);
  return new Map(
    (data ?? []).map((r) => [
      r.id,
      formatEdition(
        {
          id: r.id,
          label: r.label,
          publisher: null,
          year: r.release_year,
          language: null,
          totalUnits: r.duration_minutes,
          isbn: null,
          coverUrl: null,
          isPrimary: r.is_primary,
        },
        itemType
      ),
    ])
  );
}

// Agregados reales de la comunidad para una ficha: la media y el histograma
// salen de los pases (diary_entries), no de library_entries.rating — esa
// columna se está jubilando y una entrada puede acumular varios pases
// (relecturas, revisionados). Las reseñas también son pases: los que tienen
// texto público. La visibilidad la resuelve RLS: solo se ven filas de
// perfiles públicos (más las propias del que mira), así que aquí no hay
// filtro extra.
export async function getCommunity(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string
): Promise<Community> {
  // Notas: un voto por usuario, el de su pase cerrado más reciente, sin
  // contar las entradas abandonadas (dropped). latestRatingPerUser hace el
  // "quédate con el último pase por user_id" en TypeScript porque Supabase
  // no expresa DISTINCT ON en su query builder. item_type/item_id/status ya
  // son columnas propias del pase (§Tarea 9): sin join a library_entries — el
  // filtro de abandono pasa de la ENTRADA al PASE (cambio semántico validado
  // en la Tarea 1, control de medias).
  const { data: passRows } = await supabase
    .from("passes")
    .select("id, rating, finished_on, user_id")
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .not("finished_on", "is", null)
    .not("rating", "is", null)
    .neq("status", "dropped");

  const ratedPasses: RatedPass[] = (passRows ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    // finished_on y rating no son null por los .not(...) de arriba.
    finishedOn: r.finished_on as string,
    rating: r.rating as number,
  }));
  const ratings = latestRatingPerUser(ratedPasses).map((r) => r.rating);

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

  // Reseñas: pases con texto, de cualquier pase de esta obra (incluidos los
  // abandonados — una reseña sigue siendo válida aunque el pase no vote).
  // pass_reviews ya expone item_type/item_id directamente: sin el paso previo
  // por library_entries que sacaba entryIds.
  let reviews: CommunityReview[] = [];
  {
    // review ya no es una columna legible de diary_entries: se lee de la
    // vista pass_reviews (privacidad ya aplicada — ver
    // 20260714_passes_review_privacy.sql). El .eq("is_public", true) de abajo
    // es ahora redundante con lo que ya filtra la vista, pero se deja como
    // defensa en profundidad y para dejar la intención explícita.
    const { data: diaryRows } = await supabase
      .from("pass_reviews")
      .select("id, user_id, finished_on, rating, review, edition_id")
      .eq("item_type", itemType)
      .eq("item_id", itemId)
      .not("review", "is", null)
      // Un pase abierto no es una reseña: todavía no ha terminado, así que
      // no debe verlo la comunidad.
      .not("finished_on", "is", null)
      // Una reseña privada es de su autor y de nadie más.
      .eq("is_public", true)
      .order("finished_on", { ascending: false })
      .limit(MAX_REVIEWS);

    // El filtro anterior garantiza finished_on no nulo; se narrowa aquí
    // porque Supabase no infiere el tipo a partir de la query. pass_reviews
    // tipa TODAS sus columnas como nullable (es una vista), así que también
    // se narrowan id/user_id — nunca vienen null en la práctica.
    const rows = (diaryRows ?? []).filter(
      (r): r is typeof r & { id: string; user_id: string; finished_on: string } =>
        r.id !== null &&
        r.user_id !== null &&
        r.finished_on !== null &&
        (r.review ?? "").trim() !== ""
    );

    if (rows.length > 0) {
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const editionIds = [
        ...new Set(rows.map((r) => r.edition_id).filter((id): id is string => id !== null)),
      ];

      const [{ data: profiles }, editionLabelById] = await Promise.all([
        supabase.from("profiles").select("user_id, username, display_name").in("user_id", userIds),
        loadEditionLabels(supabase, itemType, editionIds),
      ]);

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
          editionLabel: r.edition_id ? (editionLabelById.get(r.edition_id) ?? null) : null,
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

  const knownUsernames = await resolveKnownMentions(supabase, [
    ...reviews.map((r) => r.text),
    ...reviews.flatMap((r) => r.comments.map((c) => c.body)),
  ]);

  return { avgRating, ratingCount: ratings.length, distribution, reviews, knownUsernames };
}
