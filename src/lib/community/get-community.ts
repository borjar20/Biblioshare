import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient, type createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import {
  emptyReactions,
  type InteractionComment,
  type ReactionsByEmoji,
} from "@/lib/social/interactions";
import { getInteractionSummary } from "@/lib/social/get-interaction-summary";
import { resolveKnownMentions } from "@/lib/social/resolve-mentions";
import { formatEdition } from "@/lib/editions/edition-label";
import { toStar } from "@/lib/stats/rating";
import { latestRatingPerUser, type RatedPass } from "./latest-rating";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CommunityReview = {
  id: string;
  // null = la reseña no tiene post (un pase terminado por import sin
  // autopublicar): se muestra sin hilo social. Los pases terminados con post
  // (backfill/autopost) llevan el target del post `finished`, el MISMO que ve
  // el feed y /post/[id] — la conversación converge.
  interactionTargetId: string | null;
  author: string;
  initials: string;
  /** Username del autor para enlazar a /u/:username. null = perfil sin username. */
  username: string | null;
  /** Avatar del autor (Storage o URL legado); null = iniciales. */
  avatarUrl: string | null;
  finishedOn: string; // ISO date
  rating: number | null; // 1–10
  text: string;
  editionLabel: string | null;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
  reactions: ReactionsByEmoji;
};

export type Community = {
  avgRating: number | null; // 1–10, un decimal; null si nadie ha puntuado
  ratingCount: number;
  // Recuentos por MEDIA estrella, ascendente: [0,5★, 1★, …, 4,5★, 5★] (10 cubos).
  distribution: number[];
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
      .select("id, label, publisher, published_year, language, total_pages, isbn, cover_url")
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
          },
          itemType
        ),
      ])
    );
  }

  const { data } = await supabase
    .from("movie_versions")
    .select("id, label, release_year, duration_minutes")
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
        },
        itemType
      ),
    ])
  );
}

/** Solo el agregado de puntuación: lo único que el hero de la ficha necesita. */
export type RatingSummary = Pick<
  Community,
  "avgRating" | "ratingCount" | "distribution"
>;

// Agregados reales de la comunidad para una ficha: la media y el histograma
// salen de los pases (diary_entries), no de library_entries.rating — esa
// columna se está jubilando y una entrada puede acumular varios pases
// (relecturas, revisionados).
//
// Partido en dos (#439): el HERO solo pinta `avgRating`/`ratingCount`, así que
// espera a `getRatingSummary` —una consulta a `passes`—. Las reseñas y todo lo
// que cuelga de ellas (perfiles, ediciones, reacciones, menciones) son ~4
// roundtrips más que solo pinta `CommunityPanel`, detrás del <Suspense> de las
// pestañas: viven en `getReviews`.
//
// Cliente SIN sesión (#436): el agregado es, por diseño, la media de los
// perfiles PÚBLICOS —lo que ve un visitante sin cuenta—, IDÉNTICO para todo el
// mundo y por tanto cacheable en Fase 4. CAMBIO DE COMPORTAMIENTO respecto a
// antes: con el cliente de sesión, RLS colaba en la media los pases del propio
// espectador y los de perfiles privados que sigue; ahora NO cuentan. Es la
// definición canónica de "media de la comunidad" (decisión en decisiones.md).
// getReviews NO puede seguir el mismo camino: lleva `viewerReacted`, que sí
// depende de quién mira.
export async function getRatingSummary(
  itemType: ItemType,
  itemId: string
): Promise<RatingSummary> {
  "use cache";
  // Cacheable por #437: es la media de perfiles PÚBLICOS (cliente anónimo,
  // escalares), idéntica para todo el mundo — decisión de #436/decisiones.md.
  // A diferencia de créditos/sagas, el espectador SÍ la cambia al cerrar un pase
  // con nota, así que se invalida con `updateTag(ratings:*)` desde
  // `revalidateReadingLog` (read-your-own-writes). `hours` acota la ventana si
  // algún escritor futuro se saltara ese único punto de invalidación.
  cacheLife("hours");
  cacheTag(`ratings:${itemType}:${itemId}`);
  const supabase = createPublicClient();
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
  // Diez cubos por MEDIA estrella, ascendente: índice 0 = 0,5★ … índice 9 = 5★.
  // Recuentos, no porcentajes: la barra se normaliza contra el pico al pintarse,
  // y el porcentaje solo alimentaba un «%» por fila que ya no se enseña. Antes
  // agrupaba en cinco estrellas enteras con ceil(r/2), y toda nota impar —cada
  // media estrella— saltaba a la entera de arriba; esa distribución se perdía.
  const distribution = Array<number>(10).fill(0);
  if (ratings.length > 0) {
    avgRating =
      Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
    for (const r of ratings) {
      // toStar: 1→0,5★ … 10→5★ (acotado). El cubo es estrella*2 − 1.
      distribution[Math.round(toStar(r) * 2) - 1] += 1;
    }
  }

  return { avgRating, ratingCount: ratings.length, distribution };
}

// Reseñas de la comunidad (texto público) + los @usernames que mencionan.
// ~4 roundtrips; vive detrás del <Suspense> de las pestañas, nunca en el hero
// (#439). Mismo cliente de sesión: RLS solo sirve filas de perfiles públicos
// más las propias del que mira.
export async function getReviews(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string
): Promise<Pick<Community, "reviews" | "knownUsernames">> {
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
        supabase.from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", userIds),
        loadEditionLabels(supabase, itemType, editionIds),
      ]);

      const identityByUser = new Map(
        (profiles ?? []).map((p) => [
          p.user_id,
          { name: p.display_name || p.username, username: p.username, avatarUrl: p.avatar_url },
        ])
      );

      const reviewBases = rows.map((r) => {
        const identity = identityByUser.get(r.user_id);
        const author = identity?.name ?? "—";
        return {
          id: r.id,
          author,
          initials: initials(author) || "?",
          username: identity?.username ?? null,
          avatarUrl: identity?.avatarUrl ?? null,
          finishedOn: r.finished_on,
          rating: r.rating,
          text: (r.review ?? "").trim(),
          editionLabel: r.edition_id ? (editionLabelById.get(r.edition_id) ?? null) : null,
          interactionTargetId: null as string | null,
          reactionCount: 0,
          viewerReacted: false,
          commentCount: 0,
          comments: [],
          reactions: emptyReactions(),
        };
      });

      // El hilo de una reseña vive ahora en el target del post `finished`
      // (kind='post', source_id=post.id): el backfill promovió los diary_entry
      // in-place, así que ficha y feed convergen en el MISMO target. Un pase
      // terminado SIN post (import no autopublicado) se muestra sin hilo — no se
      // rompe. `rows` son pases (r.id = pass.id), que es el `source_id` del post.
      const passIds = reviewBases.map((r) => r.id);
      const { data: finishedPosts } = await supabase
        .from("posts")
        .select("id, source_id")
        .eq("kind", "finished")
        .eq("source_kind", "pass")
        .in("source_id", passIds);
      const postIdByPass = new Map(
        (finishedPosts ?? [])
          .filter((p): p is { id: string; source_id: string } => p.source_id !== null)
          .map((p) => [p.source_id, p.id]),
      );
      const postIds = [...postIdByPass.values()];
      const summaries = postIds.length
        ? await getInteractionSummary(supabase, "post", postIds)
        : new Map();
      reviews = reviewBases.map((review) => {
        const postId = postIdByPass.get(review.id);
        const summary = postId ? summaries.get(postId) : undefined;
        return summary ? { ...review, ...summary } : review;
      });
    }
  }

  const knownUsernames = await resolveKnownMentions(supabase, [
    ...reviews.map((r) => r.text),
    ...reviews.flatMap((r) => r.comments.map((c) => c.body)),
  ]);

  return { reviews, knownUsernames };
}

// El objeto entero. Ya no se usa en el camino crítico de la ficha (la página
// llama a getRatingSummary para el hero y getReviews con las pestañas), pero se
// mantiene como combinador para quien quiera la comunidad completa de una vez.
export async function getCommunity(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string
): Promise<Community> {
  const [summary, reviews] = await Promise.all([
    getRatingSummary(itemType, itemId),
    getReviews(supabase, itemType, itemId),
  ]);
  return { ...summary, ...reviews };
}
