import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getQueues } from "@/lib/queue/get-queues";
import type { Queue } from "@/lib/queue/types";
import {
  LogPanel,
  type ManagedEntry,
} from "@/components/detail/log-panel";
import { WatchProviders } from "@/components/watch-providers";
import { CreditsSection } from "@/components/credits-section";
import { ItemHero } from "@/components/detail/item-hero";
import { ItemDetailTabs } from "@/components/detail/item-detail-tabs";
import { InfoPanel } from "@/components/detail/info-panel";
import {
  MetadataSidebar,
  type MetaRow,
} from "@/components/detail/metadata-sidebar";
import { CommunityPanel } from "@/components/detail/community-panel";
import { EpisodePanel } from "@/components/detail/episode-panel";
import { SagaStrip } from "@/components/detail/saga-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getWatchProviders } from "@/lib/catalog/tmdb";
import { getCommunity } from "@/lib/community/get-community";
import { ensureSeriesEpisodes } from "@/lib/library/ensure-series-episodes";
import { getEpisodeData } from "@/lib/series/get-episode-data";
import { getEpisodeReviews } from "@/lib/series/get-episode-reviews";
import { ensureItemEnriched } from "@/lib/people/enrich-item";
import { getItemCredits } from "@/lib/people/get-item-credits";
import { getItemSaga } from "@/lib/sagas/get-item-saga";
import { getSaga } from "@/lib/sagas/get-saga";
import type { SagaMember } from "@/lib/sagas/types";
import { parsePosition } from "@/lib/library/position";
import { getSessions } from "@/lib/sessions/get-sessions";
import type { ProgressSession } from "@/lib/sessions/types";
import { getPasses } from "@/lib/passes/get-passes";
import type { Pass } from "@/lib/passes/types";
import type { MediaStatus } from "@/lib/library/types";
import { CatalogEditor, EditFichaButton } from "@/components/detail/catalog-editor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: series } = await supabase
    .from("series")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return { title: series ? `${series.title} — Biblioshare` : "Biblioshare" };
}

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("item");
  const tDetail = await getTranslations("detail");
  const tMeta = await getTranslations("detail.meta");
  const tLibrary = await getTranslations("library");
  const supabase = await createClient();

  const [
    { data: series },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("series")
      .select(
        "id, title, creator, cover_url, synopsis, release_year, total_seasons, total_episodes, genres, tmdb_id",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!series) notFound();

  await ensureItemEnriched(supabase, "series", {
    id: series.id,
    tmdbId: series.tmdb_id,
  });
  await ensureSeriesEpisodes(supabase, {
    id: series.id,
    tmdbId: series.tmdb_id,
    totalSeasons: series.total_seasons,
  });

  const [watchProviders, credits, saga] = await Promise.all([
    series.tmdb_id ? getWatchProviders("tv", series.tmdb_id) : null,
    getItemCredits(supabase, "series", series.id),
    getItemSaga(supabase, "series", series.id),
  ]);

  let entry: ManagedEntry | null = null;
  let sessions: ProgressSession[] = [];
  let passes: Pass[] = [];
  let queues: Queue[] = [];
  if (user) {
    const { data: row } = await supabase
      .from("library_entries")
      .select("id, status, rating, position, notes, queue_id")
      .eq("user_id", user.id)
      .eq("item_type", "series")
      .eq("item_id", series.id)
      .maybeSingle();
    if (row) {
      entry = {
        entryId: row.id,
        status: row.status as MediaStatus,
        rating: row.rating,
        position: parsePosition("series", row.position),
        notes: row.notes,
        queueId: row.queue_id,
      };
      // Las sesiones son del pase ABIERTO, no de toda la entrada (Hallazgo
      // 4): en una relectura, las sesiones de la lectura anterior no deben
      // colarse bajo el cartel de la edición del pase nuevo. Por eso getPasses
      // va primero: getSessions necesita saber cuál es el pase abierto.
      passes = await getPasses(supabase, row.id);
      // El pase abierto si lo hay; si ya terminaste, el último cerrado. Sin ese
      // segundo caso, la lista de sesiones de una serie vista se quedaría vacía
      // para siempre: getPasses ordena el abierto primero y luego los cerrados
      // de más reciente a más antiguo, así que passes[0] es el que toca.
      const currentPassId =
        passes.find((p) => p.finishedOn === null)?.id ?? passes[0]?.id ?? null;
      sessions = await getSessions(supabase, currentPassId, "series");
    }
    queues = await getQueues(supabase, user.id);
  }

  const byline =
    [
      series.creator || null,
      series.release_year ? String(series.release_year) : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  const canContribute = user
    ? hasMinRole(await getCurrentUserRole(supabase), "collaborator")
    : false;

  const metaRows: MetaRow[] = [];
  if (series.creator)
    metaRows.push({ label: tMeta("creator"), value: series.creator });
  if (series.release_year)
    metaRows.push({ label: tMeta("year"), value: String(series.release_year) });
  if (series.total_seasons)
    metaRows.push({
      label: tMeta("seasons"),
      value: `${series.total_seasons} ${t("seasons")}`,
    });
  if (series.total_episodes)
    metaRows.push({
      label: tMeta("episodes"),
      value: `${series.total_episodes} ${t("episodes")}`,
    });

  const genres = series.genres ?? [];
  const [community, episodeData, episodeReviews] = await Promise.all([
    getCommunity(supabase, "series", series.id),
    getEpisodeData(supabase, series.id, user?.id ?? null),
    getEpisodeReviews(supabase, series.id),
  ]);

  // La rejilla y la lista comparten datos; la lista necesita un array
  // serializable (el Map de EpisodeData no cruza el límite RSC).
  const seasonGroups = episodeData.seasons.map((season) => ({
    season,
    episodes: episodeData.bySeasons.get(season) ?? [],
  }));
  const hasEpisodes = episodeData.seasons.length > 0;

  let sagaMembers: SagaMember[] = [];
  if (saga) {
    const full = await getSaga(supabase, saga.sagaId);
    sagaMembers = full?.members ?? [];
  }

  return (
    <div className="flex flex-col">
      <ItemHero
        itemType="series"
        mediaLabel={tDetail("mediaLabel.series")}
        title={series.title}
        byline={byline}
        genres={genres}
        coverUrl={series.cover_url}
        avgRating={community.avgRating}
        ratingCount={community.ratingCount}
        ratingsLabel={tDetail("ratings")}
        backLabel={tDetail("back")}
        statusSlot={
          entry ? (
            <StatusBadge
              status={entry.status}
              label={tLibrary(`status.${entry.status}`)}
            />
          ) : null
        }
      />

      <ItemDetailTabs
        itemType="series"
        labels={{
          info: tDetail("tabInfo"),
          ...(hasEpisodes && { episodes: tDetail("tabEpisodes") }),
          community: tDetail("tabCommunity"),
          log: tDetail("tabLog"),
        }}
        info={
          <CatalogEditor
            itemType="series"
            itemId={series.id}
            item={{
              title: series.title,
              author: series.creator,
              synopsis: series.synopsis,
              genres,
              year: series.release_year,
              coverUrl: series.cover_url,
            }}
            // Las series no tienen ediciones: CatalogEditor no pinta esa
            // sección para este tipo, así que este array nunca se usa.
            editions={[]}
            saga={saga ? { id: saga.sagaId, name: saga.name } : null}
            canContribute={canContribute}
          >
            <div className="flex flex-col gap-10">
              {saga && sagaMembers.length >= 2 && (
                <SagaStrip
                  members={sagaMembers}
                  currentType="series"
                  currentId={series.id}
                  sagaId={saga.sagaId}
                  sagaName={saga.name}
                  label={tDetail("saga")}
                />
              )}
              <InfoPanel
                aboutLabel={tDetail("about")}
                synopsis={series.synopsis}
                noSynopsisLabel={tDetail("noSynopsis")}
                actions={<EditFichaButton />}
                sidebar={
                  <MetadataSidebar
                    rows={metaRows}
                    genres={genres}
                    genresLabel={tDetail("genres")}
                  />
                }
                extra={
                  <>
                    <CreditsSection credits={credits} />
                    {watchProviders && <WatchProviders data={watchProviders} />}
                  </>
                }
              />
            </div>
          </CatalogEditor>
        }
        episodes={
          hasEpisodes ? (
            <EpisodePanel
              seriesId={series.id}
              seasons={seasonGroups}
              isLoggedIn={Boolean(user)}
            />
          ) : undefined
        }
        community={
          <div className="flex flex-col gap-10">
            <CommunityPanel
              itemType="series"
              community={community}
              episodeReviews={episodeReviews}
              viewerLoggedIn={Boolean(user)}
            />
          </div>
        }
        log={
          <LogPanel
            itemType="series"
            itemId={series.id}
            entry={entry}
            passes={passes}
            sessions={sessions}
            // Las series no tienen ediciones (getEditions ni siquiera
            // consulta la BD para este tipo): no hace falta cargarlas.
            editions={[]}
            queues={queues}
          />
        }
      />
    </div>
  );
}
