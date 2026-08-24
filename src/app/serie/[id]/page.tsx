import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  heroStatusLabels,
  statusVerbs,
} from "@/lib/library/hero-status-labels";
import { ItemRailActions } from "@/components/detail/item-rail-actions";
import {
  createClient,
  createTokenClient,
  getAccessToken,
  getCurrentUser,
} from "@/lib/supabase/server";
import { ItemTabsSkeleton } from "@/components/detail/item-tabs-skeleton";
import { ItemShellSkeleton } from "@/components/detail/item-shell-skeleton";
import { RouteMessages } from "@/components/route-messages";

// Namespaces de cliente de la ficha de serie (medidos, #444): como libro/película
// más `episode` (rejilla de episodios).
const DETAIL_NS = [
  "catalogEdit", "collection", "detail", "editions", "episode",
  "item", "library", "notes", "passes", "social",
] as const;
import { LogPanel, type ManagedEntry } from "@/components/detail/log-panel";
import { HeroMenu } from "@/components/detail/hero-menu";
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
import { ItemStatusProvider } from "@/components/detail/item-status-context";
import { HeroStatusOrFollow } from "@/components/detail/hero-status-or-follow";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getWatchProviders } from "@/lib/catalog/tmdb";
import { ensureSeriesHydrated } from "@/lib/catalog/hydrate-screen";
import {
  getRatingSummary,
  getReviews,
  type Community,
  type RatingSummary,
} from "@/lib/community/get-community";
import { ensureSeriesEpisodes } from "@/lib/library/ensure-series-episodes";
import { getEpisodeData } from "@/lib/series/get-episode-data";
import { getEpisodeReviews } from "@/lib/series/get-episode-reviews";
import { ensureItemEnriched } from "@/lib/people/enrich-item";
import { expireItemCredits } from "@/lib/reactivity/revalidate";
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
import { NotesSection } from "@/components/notes/notes-section";

import { UNTITLED_FALLBACK } from "@/lib/catalog/untitled";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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

  return { title: series ? `${series.title ?? UNTITLED_FALLBACK} — Biblioshare` : "Biblioshare" };
}

type Supa = Awaited<ReturnType<typeof createClient>>;

function fetchSeries(supabase: Supa, id: string) {
  return supabase
    .from("series")
    .select(
      "id, title, creator, cover_url, synopsis, release_year, total_seasons, total_episodes, episode_runtime_minutes, genres, tmdb_id, hydrated_at",
    )
    .eq("id", id)
    .maybeSingle();
}

type SeriesRow = NonNullable<Awaited<ReturnType<typeof fetchSeries>>["data"]>;

type SeriesDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cerrar?: string }>;
};

// Página síncrona: `params`/`searchParams` bajan a SeriesDetail, por DEBAJO del
// <Suspense> (#442). Ver /libro para el porqué.
export default function SeriesDetailPage(props: SeriesDetailProps) {
  return (
    <Suspense fallback={<ItemShellSkeleton itemType="series" />}>
      <RouteMessages ns={DETAIL_NS}>
        <SeriesDetail {...props} />
      </RouteMessages>
    </Suspense>
  );
}

async function SeriesDetail({ params, searchParams }: SeriesDetailProps) {
  const { id } = await params;
  const { cerrar } = await searchParams;
  const tDetail = await getTranslations("detail");
  const supabase = await createClient();

  const [{ data: series }, user, accessToken] = await Promise.all([
    fetchSeries(supabase, id),
    getCurrentUser(),
    // Para el `after()` de hidratación: hay que leerlo AQUÍ, durante el render.
    getAccessToken(),
  ]);

  if (!series) notFound();

  // Hidratación de la OBRA (TMDB): se resuelve en after() porque es una API
  // externa que escribe. Lo normal es que la fila ya llegue hidratada
  // (openCatalogItem hidrata al pulsar el resultado), así que esto es sobre
  // todo curador de filas viejas (`hydrated_at` null). Mismo criterio que
  // ensureBookHydrated en libro/[id]/page.tsx — ver el comentario ahí.
  //
  // Solo con sesión (`accessToken` lo hay si y solo si hay sesión): un
  // visitante anónimo no puede escribir (grant de `authenticated`, y la RPC
  // exige además `auth.uid()`).
  //
  // El token se lee DURANTE el render y se le pasa al callback como valor; el
  // cliente de la petición NO puede cruzar a un `after()` porque lee cookies en
  // cada consulta y eso, en un Server Component, lanza (#751). El porqué
  // completo está en libro/[id]/page.tsx.
  if (accessToken) {
    after(() =>
      ensureSeriesHydrated(createTokenClient(accessToken), {
        id: series.id,
        tmdb_id: series.tmdb_id,
        hydrated_at: series.hydrated_at,
      }),
    );
  }

  // Lo mínimo para pintar el hero: nota media y estado del pase activo. El
  // resto (sincronización de episodios con TMDB, plataformas, reparto, saga,
  // pases) llega por streaming en las pestañas — Fase B del plan de navegación.
  // El pase activo entero: el rail de PC enseña también la nota (y el
  // progreso donde lo hay). Misma consulta, mismo viaje.
  // Los dos recuentos del rail ("16 / 20 vistos", frame 11) van en el MISMO
  // Promise.all: cuestan cero tiempo en serie. El de vistos filtra por el pase
  // activo sin conocer su id, con el join embebido (passes!inner) — verificado
  // contra dev que devuelve lo mismo que la consulta en dos pasos.
  // El rol también (menú ⋯ del hero, P2): todo paralelo, coste cero en serie.
  const [ratingSummary, activePass, watchedEpisodes, catalogEpisodes, shellRole] =
    await Promise.all([
      getRatingSummary("series", series.id),
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
      user ? getCurrentUserRole() : Promise.resolve(null),
    ]);
  const activeStatus = (activePass?.status as MediaStatus | undefined) ?? null;
  const canEditCatalog = hasMinRole(shellRole, "collaborator");

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
        title={series.title ?? tDetail("untitled")}
        byline={byline}
        genres={genres}
        coverUrl={series.cover_url}
        avgRating={ratingSummary.avgRating}
        ratingsLabel={tDetail("ratings", { count: ratingSummary.ratingCount })}
        backLabel={tDetail("back")}
        statusSlot={
          <HeroStatusOrFollow
            itemType="series"
            itemId={series.id}
            isLoggedIn={Boolean(user)}
            statusLabels={statusLabels}
          />
        }
        menuSlot={
          <HeroMenu
            itemType="series"
            itemId={series.id}
            canEditCatalog={canEditCatalog}
          />
        }
        railActions={
          <ItemRailActions
            itemType="series"
            itemId={series.id}
            isLoggedIn={Boolean(user)}
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
              ratingSummary={ratingSummary}
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
  ratingSummary,
  cerrar,
}: {
  series: SeriesRow;
  userId: string | null;
  ratingSummary: RatingSummary;
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
  const [enriched, , watchProviders, sagas, activeRow, role, reviewsResult] =
    await Promise.all([
      ensureItemEnriched(supabase, "series", {
        id: series.id,
        tmdbId: series.tmdb_id,
        // Episodios y duración de episodio se hidratan aquí (misma respuesta
        // que los créditos); sin pasarlos no hay con qué decidir. Ver #365.
        totalEpisodes: series.total_episodes,
        episodeRuntimeMinutes: series.episode_runtime_minutes,
      }),
      ensureSeriesEpisodes(supabase, {
        id: series.id,
        tmdbId: series.tmdb_id,
        totalSeasons: series.total_seasons,
      }),
      series.tmdb_id ? getWatchProviders("tv", series.tmdb_id) : null,
      getItemSagas("series", series.id),
      // "En mi biblioteca" = existe pase ACTIVO de la obra (§Tarea 9, hub).
      userId
        ? supabase
            .from("passes")
            .select("id, status, rating, position")
            .eq("user_id", userId)
            .eq("item_type", "series")
            .eq("item_id", series.id)
            .eq("is_active", true)
            .maybeSingle()
            .then(({ data }) => data)
        : null,
        userId ? getCurrentUserRole() : null,
      // Reseñas de la comunidad: ~4 roundtrips que solo pinta CommunityPanel;
      // van aquí, detrás del <Suspense> de las pestañas, no en el hero (#439).
      getReviews(supabase, "series", series.id),
    ]);

  // Community que espera CommunityPanel = el agregado (ya resuelto en el hero)
  // más las reseñas (aquí).
  const community: Community = { ...ratingSummary, ...reviewsResult };

  // Lo único que de verdad esperaba a ensureItemEnriched.
  const credits = await getItemCredits("series", series.id);

  // Ver la nota de la ficha de libro: caducar la etiqueta `credits:*` cuando el
  // enriquecimiento perezoso ha escrito de verdad, y hacerlo tras la respuesta
  // porque durante el render las APIs de revalidación no son legales (F1-023).
  after(() => {
    if (enriched.wroteCredits) expireItemCredits("series", series.id);
  });

  let entry: ManagedEntry | null = null;
  let sessions: ProgressSession[] = [];
  let passes: Pass[] = [];
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
  const [episodeData, episodeReviewsResult] = await Promise.all([
    getEpisodeData(supabase, series.id, userId, activePassId),
    getEpisodeReviews(supabase, series.id),
  ]);
  const { reviews: episodeReviews, knownUsernames: episodeKnownUsernames } = episodeReviewsResult;

  // La rejilla y la lista comparten datos; la lista necesita un array
  // serializable (el Map de EpisodeData no cruza el límite RSC).
  const seasonGroups = episodeData.seasons.map((season) => ({
    season,
    episodes: episodeData.bySeasons.get(season) ?? [],
  }));
  const hasEpisodes = episodeData.seasons.length > 0;

  // La principal es la marcada is_primary (created_at como desempate si
  // ninguna lo es); getItemSagas ya la deja primera. Solo de ella se pinta
  // la tira de portadas, y solo en móvil. Ver getItemSagas.
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
            title: series.title ?? tDetail("untitled"),
            author: series.creator,
            synopsis: series.synopsis,
            genres,
            year: series.release_year,
            coverUrl: series.cover_url,
          }}
          // Las series no tienen ediciones: CatalogEditor no pinta esa
          // sección para este tipo, así que este array nunca se usa.
          editions={[]}
          sagas={sagas.map((s) => ({ sagaId: s.sagaId, name: s.name, isPrimary: s.isPrimary }))}
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
            episodeKnownUsernames={episodeKnownUsernames}
            viewerLoggedIn={Boolean(userId)}
          />
        </div>
      }
      log={
        <div className="flex flex-col gap-4">
          <LogPanel
            itemType="series"
            itemId={series.id}
            entry={entry}
            passes={passes}
            sessions={sessions}
            // Las series no tienen ediciones (getEditions ni siquiera
            // consulta la BD para este tipo): no hace falta cargarlas.
            editions={[]}
            initialClosingPassId={initialClosingPassId}
            canContribute={canContribute}
          />
          {userId && <NotesSection userId={userId} itemType="series" itemId={series.id} />}
        </div>
      }
    />
  );
}
