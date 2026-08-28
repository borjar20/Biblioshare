import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import { parsePosition, type Position } from "@/lib/library/position";
import type { MediaStatus } from "@/lib/library/types";
import { getActivePass } from "@/lib/passes/get-passes";
import { getEditions } from "@/lib/editions/get-editions";
import { pagesForPass } from "@/lib/editions/edition-label";
import { ensureSeriesEpisodes } from "@/lib/library/ensure-series-episodes";
import { getEpisodeData } from "@/lib/series/get-episode-data";

// Un episodio tal como lo pinta la rejilla de la hoja. `title` y `stillUrl`
// salen de series_episodes vía getEpisodeData — no hay query extra: la ficha
// ya los traía y esta proyección los descartaba.
export type SessionEpisode = {
  episode: number;
  title: string | null;
  stillUrl: string | null;
  watched: boolean;
};

export type SessionSeason = {
  season: number;
  episodes: SessionEpisode[];
};

export type SessionContext = {
  passId: string;
  itemType: "book" | "series";
  itemId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  position: Position;
  status: MediaStatus;
  total: number | null;
  seriesEpisodes?: SessionSeason[];
};

// Un parámetro de URL es texto de fuera: se acepta solo si es un entero de
// minutos con sentido. Se topa a 24 h para que un valor absurdo no llegue al
// formulario.
export function parseMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const minutes = Number(raw);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

// Carga TODO lo que necesita la hoja de registrar sesión. La comparten la ruta
// directa (/sesion/[passId], deep link y recarga) y la ruta interceptada que
// la pinta como modal: ninguna de las dos duplica esta lógica.
export async function loadSessionContext(passId: string): Promise<SessionContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // El pase es el hub (§Tarea 7): la obra vive en el propio pase.
  const { data: passRow } = await supabase
    .from("passes")
    .select("id, item_type, item_id")
    .eq("id", passId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!passRow) notFound();

  // Las sesiones solo tienen sentido en libro y serie (§7.14): una película no
  // tiene progreso incremental.
  if (passRow.item_type === "movie") {
    redirect(itemHref("movie", passRow.item_id));
  }

  const itemType = passRow.item_type as "book" | "series";
  const itemId = passRow.item_id;

  // Confirma que sigue siendo el pase ACTIVO ahora mismo — nunca uno archivado
  // de una relectura anterior (mismo guard que addSession).
  const activePass = await getActivePass(supabase, itemType, itemId, user.id);
  if (!activePass || activePass.id !== passId) notFound();

  const [{ data: book }, { data: series }] = await Promise.all([
    itemType === "book"
      ? supabase
          .from("books")
          .select("title, author, cover_url, total_pages")
          .eq("id", itemId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    itemType === "series"
      ? supabase
          .from("series")
          .select("title, creator, cover_url, total_episodes, total_seasons, tmdb_id")
          .eq("id", itemId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let seriesEpisodes: SessionSeason[] | undefined;
  if (itemType === "series" && series) {
    await ensureSeriesEpisodes(supabase, {
      id: itemId,
      tmdbId: series.tmdb_id,
      totalSeasons: series.total_seasons,
    });
    const episodeData = await getEpisodeData(supabase, itemId, user.id, activePass.id);
    seriesEpisodes = episodeData.seasons.map((season) => ({
      season,
      episodes: (episodeData.bySeasons.get(season) ?? []).map((e) => ({
        episode: e.episode,
        title: e.title,
        stillUrl: e.stillUrl,
        watched: e.own.watched,
      })),
    }));
  }

  // El total sale de la EDICIÓN QUE EL USUARIO IDENTIFICÓ en su pase; sin ella,
  // de las páginas orientativas de la obra (bolsillo y tapa dura no tienen las
  // mismas páginas). Dos peldaños, `pagesForPass`: la «edición primaria» ya no
  // existe como criterio (spec 2026-08-26 §5).
  const editions = await getEditions(itemType, itemId);
  const passEdition =
    editions.find((e) => e.id === activePass.editionId) ?? null;
  const total = pagesForPass(
    passEdition,
    book?.total_pages ?? series?.total_episodes ?? null,
  );

  return {
    passId: activePass.id,
    itemType,
    itemId,
    title: book?.title ?? series?.title ?? "",
    author: book?.author ?? series?.creator ?? null,
    coverUrl: book?.cover_url ?? series?.cover_url ?? null,
    position: parsePosition(itemType, activePass.position),
    status: activePass.status,
    total,
    seriesEpisodes,
  };
}
