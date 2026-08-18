import type { createClient } from "@/lib/supabase/server";
import { getRatingSummary } from "@/lib/community/get-community";
import { getItemCredits } from "@/lib/people/get-item-credits";
import { anchorHref, type AnchorType } from "@/lib/catalog/anchor";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { UNTITLED_FALLBACK } from "@/lib/catalog/untitled";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Resumen CONTEXTUAL de la obra del post para la columna izquierda de
// `/post/[id]` (área OBRA). NO es la ficha: es lo justo para orientar —portada,
// título, tipo, año, creador, valoración de la comunidad, tu estado/valoración
// si existe— con CTA a la ficha completa. Fetch propio y ligero (fila del ancla
// + `getRatingSummary` cacheado + el pase activo del visitante), sin la
// maquinaria pesada de la ficha (hidratación, créditos, ediciones, streaming).
//
// La media de la comunidad es cacheable (regla #437: agregado público idéntico
// para todos, cliente anónimo); el estado/valoración del visitante es
// per-usuario (RLS) y por eso solo se resuelve con `viewerId` — pero la ruta ya
// es dinámica (`instant = false`), así que esa consulta no rompe nada.
//
// Saga/persona como ancla (posts de tipo «pensamiento»): resumen mínimo —el
// nombre ES el título, sin año/creador/valoración/estado—, con CTA a su ficha.
export type WorkSummary = {
  type: AnchorType;
  id: string;
  href: string;
  title: string;
  coverUrl: string | null;
  year: number | null;
  creator: string | null; // autor (libro) · director (peli) · creador (serie)
  genres: string[];
  community: { avgRating: number | null; ratingCount: number; distribution: number[] } | null;
  viewer: { status: MediaStatus; rating: number | null } | null;
};

// El «creador» real vive en `credits`, no en la fila de catálogo:
// `movies.director` y `series.creator` están SIEMPRE a null (los rellena el
// enriquecimiento en `credits`, no esas columnas). `getItemCredits` devuelve el
// `crew` ya ordenado (director → creator → writer → author), así que el primero
// es el creador principal; se muestran hasta dos del MISMO rol (co-dirección /
// co-autoría). Devuelve null si el ítem aún no se ha enriquecido.
function pickCreator(crew: { name: string; role: string }[]): string | null {
  if (crew.length === 0) return null;
  const topRole = crew[0].role;
  const names = crew.filter((c) => c.role === topRole).map((c) => c.name);
  return names.slice(0, 2).join(", ") || null;
}

export async function getWorkSummary(
  supabase: SupabaseServerClient,
  viewerId: string | null,
  type: AnchorType,
  id: string,
): Promise<WorkSummary | null> {
  const href = anchorHref(type, id);

  if (type === "saga") {
    const { data } = await supabase.from("sagas").select("name, cover_url").eq("id", id).maybeSingle();
    if (!data) return null;
    return { type, id, href, title: data.name, coverUrl: data.cover_url, year: null, creator: null, genres: [], community: null, viewer: null };
  }
  if (type === "person") {
    const { data } = await supabase.from("people").select("name, photo_url").eq("id", id).maybeSingle();
    if (!data) return null;
    return { type, id, href, title: data.name, coverUrl: data.photo_url, year: null, creator: null, genres: [], community: null, viewer: null };
  }

  // Catálogo (book | movie | series): valoración de la comunidad, créditos (para
  // el creador real, ver `pickCreator`) y pase activo del visitante, en paralelo
  // con la fila de la obra. `passes.item_type` es el mismo `ItemType`, así que la
  // consulta del pase vale para los tres. `getItemCredits` es cacheable (#437).
  const catalogType: ItemType = type;
  const community = getRatingSummary(catalogType, id);
  const credits = getItemCredits(catalogType, id);
  const viewerPass = viewerId
    ? supabase
        .from("passes")
        .select("status, rating")
        .eq("user_id", viewerId)
        .eq("item_type", type)
        .eq("item_id", id)
        .eq("is_active", true)
        .maybeSingle()
        .then((r) => r.data)
    : Promise.resolve(null);

  if (type === "book") {
    const [{ data }, comm, cred, pass] = await Promise.all([
      supabase.from("books").select("title, cover_url, published_year, genres, author").eq("id", id).maybeSingle(),
      community,
      credits,
      viewerPass,
    ]);
    if (!data) return null;
    return {
      type, id, href,
      title: data.title ?? UNTITLED_FALLBACK,
      coverUrl: data.cover_url,
      year: data.published_year ?? null,
      creator: pickCreator(cred.crew) ?? data.author ?? null,
      genres: data.genres ?? [],
      community: { avgRating: comm.avgRating, ratingCount: comm.ratingCount, distribution: comm.distribution },
      viewer: pass ? { status: pass.status, rating: pass.rating ?? null } : null,
    };
  }

  if (type === "movie") {
    const [{ data }, comm, cred, pass] = await Promise.all([
      supabase.from("movies").select("title, cover_url, release_year, genres, director").eq("id", id).maybeSingle(),
      community,
      credits,
      viewerPass,
    ]);
    if (!data) return null;
    return {
      type, id, href,
      title: data.title ?? UNTITLED_FALLBACK,
      coverUrl: data.cover_url,
      year: data.release_year ?? null,
      creator: pickCreator(cred.crew) ?? data.director ?? null,
      genres: data.genres ?? [],
      community: { avgRating: comm.avgRating, ratingCount: comm.ratingCount, distribution: comm.distribution },
      viewer: pass ? { status: pass.status, rating: pass.rating ?? null } : null,
    };
  }

  // series
  const [{ data }, comm, cred, pass] = await Promise.all([
    supabase.from("series").select("title, cover_url, release_year, genres, creator").eq("id", id).maybeSingle(),
    community,
    credits,
    viewerPass,
  ]);
  if (!data) return null;
  return {
    type, id, href,
    title: data.title ?? UNTITLED_FALLBACK,
    coverUrl: data.cover_url,
    year: data.release_year ?? null,
    creator: pickCreator(cred.crew) ?? data.creator ?? null,
    genres: data.genres ?? [],
    community: { avgRating: comm.avgRating, ratingCount: comm.ratingCount, distribution: comm.distribution },
    viewer: pass ? { status: pass.status, rating: pass.rating ?? null } : null,
  };
}
