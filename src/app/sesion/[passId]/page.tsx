import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { parsePosition } from "@/lib/library/position";
import { getActivePass } from "@/lib/passes/get-passes";
import { getEditions } from "@/lib/editions/get-editions";
import { primaryEdition } from "@/lib/editions/edition-label";
import { ensureSeriesEpisodes } from "@/lib/library/ensure-series-episodes";
import { getEpisodeData } from "@/lib/series/get-episode-data";
import { SessionForm } from "./session-form";

export const metadata: Metadata = {
  title: "Guardar sesión — Biblioshare",
};

export default async function SessionPage({
  params,
}: {
  params: Promise<{ passId: string }>;
}) {
  const { passId } = await params;
  const t = await getTranslations("session");
  const tDetail = await getTranslations("detail");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // El pase es el hub (§Tarea 7): la obra ya vive en el propio pase
  // (item_type/item_id, desde la migración A). Se busca directo por id +
  // user_id — ya no hace falta pasar por library_entries.
  const { data: passRow } = await supabase
    .from("passes")
    .select("id, item_type, item_id")
    .eq("id", passId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!passRow) notFound();

  // Sessions only make sense for books and series (§7.14 scope). A movie
  // entry has no incremental progress — send it back to its detail page.
  if (passRow.item_type === "movie") {
    redirect(itemHref("movie", passRow.item_id));
  }

  const itemType = passRow.item_type as "book" | "series";
  const itemId = passRow.item_id;

  // Confirma que sigue siendo el pase ACTIVO de la obra ahora mismo — nunca
  // un pase archivado de una relectura anterior (mismo guard que
  // addSession).
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
          .select(
            "title, creator, cover_url, total_episodes, total_seasons, tmdb_id",
          )
          .eq("id", itemId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const title = book?.title ?? series?.title ?? "";
  const coverUrl = book?.cover_url ?? series?.cover_url ?? null;
  const author = book?.author ?? series?.creator ?? null;

  // Temporadas + episodios pulsables (Tarea 15): salen de series_episodes,
  // nunca inventados en el cliente. Cache-as-you-go igual que la ficha de
  // serie — por si el usuario llega aquí sin haber abierto antes la ficha.
  let seriesEpisodes:
    | { season: number; episodes: { episode: number; watched: boolean }[] }[]
    | undefined;
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
        watched: e.own.watched,
      })),
    }));
  }

  // El total contra el que se mide el progreso sale de la EDICIÓN del pase
  // activo (o de la primaria si el pase no tiene ninguna asignada), no de
  // books.total_pages: la de bolsillo y la de tapa dura no tienen las mismas
  // páginas, así que "voy por la 240" solo es cierto contra tu edición. Las
  // series no tienen ediciones (getEditions devuelve []), así que caen al
  // total de episodios del catálogo.
  const editions = await getEditions(supabase, itemType, itemId);
  const edition =
    editions.find((e) => e.id === activePass.editionId) ?? primaryEdition(editions);
  const total = edition?.totalUnits ?? book?.total_pages ?? series?.total_episodes ?? null;

  const accent = MEDIA_ACCENT[itemType];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">
        {itemType === "book" ? t("titleBook") : t("titleSeries")}
      </h1>

      {/* Tarjeta de contexto del ítem (mockup "Paper - Registrar sesión",
          pantallas 1-3): recuerda qué estás registrando sin tener que volver
          atrás — el gesto se repite tanto que no puede obligar a pensar. */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
        <div className="relative h-[60px] w-10 shrink-0 overflow-hidden rounded-md bg-surface-muted">
          {coverUrl && (
            <Image src={coverUrl} alt={title} fill sizes="40px" className="object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[14.5px] font-semibold text-foreground">
            {title}
          </p>
          {author && (
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
              {author}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-1 font-mono text-[9px] font-medium tracking-wider uppercase ${accent.bgSoft} ${accent.text}`}
        >
          {tDetail(`mediaLabel.${itemType}`)}
        </span>
      </div>

      <SessionForm
        passId={activePass.id}
        itemType={itemType}
        itemId={itemId}
        position={parsePosition(itemType, activePass.position)}
        status={activePass.status}
        total={total}
        seriesEpisodes={seriesEpisodes}
      />
    </div>
  );
}
