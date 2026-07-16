import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  heroStatusLabels,
  statusVerbs,
} from "@/lib/library/hero-status-labels";
import { ItemRailActions } from "@/components/detail/item-rail-actions";
import { createClient } from "@/lib/supabase/server";
import { ItemTabsSkeleton } from "@/components/detail/item-tabs-skeleton";
import { getQueues } from "@/lib/queue/get-queues";
import type { Queue } from "@/lib/queue/types";
import { LogPanel, type ManagedEntry } from "@/components/detail/log-panel";
import { WatchProviders } from "@/components/watch-providers";
import { CreditsSection } from "@/components/credits-section";
import { ItemShell } from "@/components/detail/item-shell";
import { ItemDetailTabs } from "@/components/detail/item-detail-tabs";
import { InfoPanel } from "@/components/detail/info-panel";
import {
  MetadataSidebar,
  type MetaRow,
} from "@/components/detail/metadata-sidebar";
import { CommunityPanel } from "@/components/detail/community-panel";
import { EpisodePanel } from "@/components/detail/episode-panel";
import { SagaStrip } from "@/components/detail/saga-strip";
import {
  ItemStatusProvider,
  StatusBadgeLive,
} from "@/components/detail/item-status-context";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getWatchProviders } from "@/lib/catalog/tmdb";
import { getCommunity } from "@/lib/community/get-community";
import { ensureSeriesEpisodes } from "@/lib/library/ensure-series-episodes";
import { getEpisodeData } from "@/lib/series/get-episode-data";
import { getEpisodeReviews } from "@/lib/series/get-episode-reviews";
import { ensureItemEnriched } from "@/lib/people/enrich-item";
import { getItemCredits } from "@/lib/people/get-item-credits";
import { getItemSagas } from "@/lib/sagas/get-item-sagas";
import { SagaList } from "@/components/detail/saga-list";
import { getSaga } from "@/lib/sagas/get-saga";
import type { SagaMember, SagaMembership } from "@/lib/sagas/types";
import { parsePosition } from "@/lib/library/position";
import { getSessions } from "@/lib/sessions/get-sessions";
import type { ProgressSession } from "@/lib/sessions/types";
import { getPasses } from "@/lib/passes/get-passes";
import type { Pass } from "@/lib/passes/types";
import type { MediaStatus } from "@/lib/library/types";
import {
  CatalogEditor,
  EditFichaButton,
} from "@/components/detail/catalog-editor";

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

type Supa = Awaited<ReturnType<typeof createClient>>;

function fetchSeries(supabase: Supa, id: string) {
  return supabase
    .from("series")
    .select(
      "id, title, creator, cover_url, synopsis, release_year, total_seasons, total_episodes, genres, tmdb_id",
    )
    .eq("id", id)
    .maybeSingle();
}

type SeriesRow = NonNullable<Awaited<ReturnType<typeof fetchSeries>>["data"]>;
type Community = Awaited<ReturnType<typeof getCommunity>>;

export default async function SeriesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cerrar?: string }>;
}) {
  const { id } = await params;
  const { cerrar } = await searchParams;
  const tDetail = await getTranslations("detail");
  const supabase = await createClient();

  const [
    { data: series },
    {
      data: { user },
    },
  ] = await Promise.all([fetchSeries(supabase, id), supabase.auth.getUser()]);

  if (!series) notFound();

  // Lo mínimo para pintar el hero: nota media y estado del pase activo. El
  // resto (sincronización de episodios con TMDB, plataformas, reparto, saga,
  // pases) llega por streaming en las pestañas — Fase B del plan de navegación.
  // El pase activo entero: el rail de PC enseña también la nota (y el
  // progreso donde lo hay). Misma consulta, mismo viaje.
  // Los dos recuentos del rail ("16 / 20 vistos", frame 11) van en el MISMO
  // Promise.all: cuestan cero tiempo en serie. El de vistos filtra por el pase
  // activo sin conocer su id, con el join embebido (passes!inner) — verificado
  // contra dev que devuelve lo mismo que la consulta en dos pasos.
  const [community, activePass, watchedEpisodes, catalogEpisodes] =
    await Promise.all([
      getCommunity(supabase, "series", series.id),
      user
        ? supabase
            .from("passes")
            .select("id, status, rating, position")
            .eq("user_id", user.id)
            .eq("item_type", "series")
            .eq("item_id", series.id)
            .eq("is_active", true)
            .maybeSingle()
            .then(({ data }) => data)
        : Promise.resolve(null),
      user
        ? supabase
            .from("episode_watches")
            .select("pass_id, passes!inner(is_active)", {
              count: "exact",
              head: true,
            })
            .eq("user_id", user.id)
            .eq("series_id", series.id)
            .eq("passes.is_active", true)
            .then(({ count }) => count ?? 0)
        : Promise.resolve(0),
      user
        ? supabase
            .from("series_episodes")
            .select("*", { count: "exact", head: true })
            .eq("series_id", series.id)
            .then(({ count }) => count ?? 0)
        : Promise.resolve(0),
    ]);
  const activeStatus = (activePass?.status as MediaStatus | undefined) ?? null;

  const byline =
    [
      series.creator || null,
      series.release_year ? String(series.release_year) : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  const genres = series.genres ?? [];

  // Las 4 etiquetas de la píldora del hero ("En tu biblioteca · Viendo"),
  // traducidas aquí para que la isla de cliente (StatusBadgeLive) no arrastre
  // i18n. El provider comparte el estado del pase activo entre el badge del
  // hero y los pills de la pestaña Registro: ambos cambian en el mismo commit
  // optimista (ver item-status-context.tsx).
  // Nota de alcance: el auto-cierre por episodios (EpisodePanel) NO publica
  // ahí — redirige a `?cerrar=...&tab=log`, que es una navegación completa con
  // render fresco del servidor, así que el badge llega ya correcto.
  const statusLabels = await heroStatusLabels("series");

  // El rail de PC, solo lectura (ver item-rail-actions.tsx). El total sale del
  // catálogo (lo mismo que cuenta la pestaña Episodios); en la primera visita
  // el catálogo aún no está sincronizado y el fallback es la columna de TMDB.
  const railLabels = await statusVerbs("series");
  const totalEpisodes = catalogEpisodes || series.total_episodes || 0;
  const railProgress =
    activePass && totalEpisodes > 0
      ? {
          percent: Math.min(
            100,
            Math.round((watchedEpisodes / totalEpisodes) * 100),
          ),
          left: tDetail("rail.episodes", {
            watched: watchedEpisodes,
            total: totalEpisodes,
          }),
          right: `${Math.min(100, Math.round((watchedEpisodes / totalEpisodes) * 100))}%`,
        }
      : null;

  return (
    <ItemStatusProvider initialStatus={activeStatus}>
      <ItemShell
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
        statusSlot={<StatusBadgeLive labels={statusLabels} />}
        railActions={
          <ItemRailActions
            itemType="series"
            labels={railLabels}
            progress={railProgress}
            rating={activePass?.rating ?? null}
            ctaHref={activePass ? `/serie/${series.id}?tab=episodes` : null}
            ctaLabel={tDetail("rail.cta.series")}
            ratingLabel={tDetail("rail.yourRating")}
            goToLogLabel={tDetail("rail.goToLog")}
          />
        }
        tabs={
          <Suspense fallback={<ItemTabsSkeleton />}>
            <SeriesTabs
              series={series}
              userId={user?.id ?? null}
              community={community}
              cerrar={cerrar}
            />
          </Suspense>
        }
      />
    </ItemStatusProvider>
  );
}

// Las pestañas: sincronización de episodios (TMDB), plataformas, reparto,
// saga, pases y la rejilla de episodios — todo detrás del <Suspense> del hero.
async function SeriesTabs({
  series,
  userId,
  community,
  cerrar,
}: {
  series: SeriesRow;
  userId: string | null;
  community: Community;
  cerrar?: string;
}) {
  const supabase = await createClient();
  const t = await getTranslations("item");
  const tDetail = await getTranslations("detail");
  const tMeta = await getTranslations("detail.meta");

  // Ojo al ORDEN (mismo criterio que la ficha de libro): con Supabase remoto
  // —también en producción— cada consulta cuesta ~240 ms de ida y vuelta, así
  // que lo que manda no es cuántas hay sino cuántas van EN FILA. Las dos
  // sincronizaciones no se necesitan entre sí (una escribe personas, la otra
  // episodios), y solo getItemCredits espera de verdad a ensureItemEnriched.
  const [, , watchProviders, sagas, activeRow, loadedQueues, role] =
    await Promise.all([
      ensureItemEnriched(supabase, "series", {
        id: series.id,
        tmdbId: series.tmdb_id,
      }),
      ensureSeriesEpisodes(supabase, {
        id: series.id,
        tmdbId: series.tmdb_id,
        totalSeasons: series.total_seasons,
      }),
      series.tmdb_id ? getWatchProviders("tv", series.tmdb_id) : null,
      getItemSagas(supabase, "series", series.id),
      // "En mi biblioteca" = existe pase ACTIVO de la obra (§Tarea 9, hub).
      userId
        ? supabase
            .from("passes")
            .select("id, status, rating, position, queue_id")
            .eq("user_id", userId)
            .eq("item_type", "series")
            .eq("item_id", series.id)
            .eq("is_active", true)
            .maybeSingle()
            .then(({ data }) => data)
        : null,
      userId ? getQueues(supabase, userId) : [],
      userId ? getCurrentUserRole(supabase) : null,
    ]);

  // Lo único que de verdad esperaba a ensureItemEnriched.
  const credits = await getItemCredits(supabase, "series", series.id);

  let entry: ManagedEntry | null = null;
  let sessions: ProgressSession[] = [];
  let passes: Pass[] = [];
  const queues: Queue[] = loadedQueues;
  {
    const row = activeRow;
    if (userId && row) {
      // La nota (notes) sale de pass_reviews (privacidad ya aplicada) — ningún
      // consumidor de ManagedEntry la renderiza hoy, pero se resuelve igualmente
      // para no dejar el campo con un dato inventado.
      //
      // pass_reviews y getPasses no se necesitan entre sí: en paralelo.
      const [reviewRow, loadedPasses] = await Promise.all([
        supabase
          .from("pass_reviews")
          .select("review")
          .eq("id", row.id)
          .maybeSingle()
          .then(({ data }) => data),
        getPasses(supabase, "series", series.id, userId),
      ]);
      passes = loadedPasses;
      entry = {
        entryId: row.id,
        status: row.status as MediaStatus,
        rating: row.rating,
        position: parsePosition("series", row.position),
        notes: reviewRow?.review ?? null,
        queueId: row.queue_id,
      };
      // Las sesiones sí esperan a getPasses: son del pase ABIERTO, no de toda
      // la entrada (Hallazgo 4) — en una relectura, las sesiones de la lectura
      // anterior no deben colarse bajo el cartel de la edición del pase nuevo.
      // El pase abierto si lo hay; si ya terminaste, el último cerrado. Sin ese
      // segundo caso, la lista de sesiones de una serie vista se quedaría vacía
      // para siempre: getPasses ordena el abierto primero y luego los cerrados
      // de más reciente a más antiguo, así que passes[0] es el que toca.
      const currentPassId =
        passes.find((p) => p.finishedOn === null)?.id ?? passes[0]?.id ?? null;
      sessions = await getSessions(supabase, currentPassId, "series");
    }
  }

  // `?cerrar` (auto-cierre al terminar una sesión, §Tarea 7): validado aquí
  // contra el pase ACTIVO — ver el comentario largo en la ficha de libro
  // (src/app/libro/[id]/page.tsx), mismo mecanismo.
  const activePassId = passes.find((p) => p.isActive)?.id ?? null;
  const initialClosingPassId =
    cerrar && cerrar === activePassId ? cerrar : null;

  const canContribute = userId ? hasMinRole(role, "collaborator") : false;

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
  // El pase activo ya se calculó arriba (`activePassId`) para validar
  // `?cerrar`: la pestaña Episodios lo reutiliza para separar la capa cursor
  // (este pase) de "visto alguna vez" (Tarea 8, hub).
  const [episodeData, episodeReviews] = await Promise.all([
    getEpisodeData(supabase, series.id, userId, activePassId),
    getEpisodeReviews(supabase, series.id),
  ]);

  // La rejilla y la lista comparten datos; la lista necesita un array
  // serializable (el Map de EpisodeData no cruza el límite RSC).
  const seasonGroups = episodeData.seasons.map((season) => ({
    season,
    episodes: episodeData.bySeasons.get(season) ?? [],
  }));
  const hasEpisodes = episodeData.seasons.length > 0;

  // La principal es la primera (la más antigua): solo de ella se pinta la tira
  // de portadas, y solo en móvil. Ver getItemSagas.
  const mainSaga = sagas[0] ?? null;
  let sagaMembers: SagaMember[] = [];
  if (mainSaga) {
    const full = await getSaga(supabase, mainSaga.sagaId);
    sagaMembers = full?.members ?? [];
  }
  const sagaPosition = (s: SagaMembership) =>
    s.position !== null && s.total > 0
      ? tDetail("sagaPosition", { position: s.position, total: s.total })
      : null;

  return (
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
          saga={mainSaga ? { id: mainSaga.sagaId, name: mainSaga.name } : null}
          canContribute={canContribute}
        >
          <div className="flex flex-col gap-10">
            {sagas.length > 0 && (
              <section className="flex flex-col gap-3.5">
                <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                  {tDetail("sagasCount", { count: sagas.length })}
                </span>
                {mainSaga && sagaMembers.length >= 2 && (
                  <div className="lg:hidden">
                    <SagaStrip
                      members={sagaMembers}
                      currentType="series"
                      currentId={series.id}
                      sagaId={mainSaga.sagaId}
                      sagaName={mainSaga.name}
                      positionLabel={sagaPosition(mainSaga)}
                    />
                  </div>
                )}
                <SagaList
                  itemType="series"
                  sagas={sagas}
                  positionLabel={sagaPosition}
                />
              </section>
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
            isLoggedIn={Boolean(userId)}
          />
        ) : undefined
      }
      community={
        <div className="flex flex-col gap-10">
          <CommunityPanel
            itemType="series"
            community={community}
            episodeReviews={episodeReviews}
            viewerLoggedIn={Boolean(userId)}
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
          initialClosingPassId={initialClosingPassId}
        />
      }
    />
  );
}
