import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { getTranslations } from "next-intl/server";
import { PassCard } from "@/components/detail/pass-card";
import { PendingJointInvites } from "@/components/social/pending-joint-invites";
import { getPendingJointInvites } from "@/lib/social/joint-viewings";
import { StickyPassCta } from "@/components/detail/sticky-pass-cta";
import { EpisodeBrowser, EpisodeJournal } from "@/components/detail/series-episode-context";
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
  "item", "library", "margin", "notes", "passes", "ritual", "social", "joint",
] as const;
import { PassDiary } from "@/components/detail/pass-diary";
import { LogPanel, type ManagedEntry } from "@/components/detail/log-panel";
import { HeroMenu } from "@/components/detail/hero-menu";
import { WatchProviders } from "@/components/watch-providers";
import { CreditsSection } from "@/components/credits-section";
import { ItemShell } from "@/components/detail/item-shell";
import { resolveWorkHue } from "@/lib/catalog/work-hue";
import { ItemDetailTabs } from "@/components/detail/item-detail-tabs";
import { InfoPanel } from "@/components/detail/info-panel";
import { InfoLayout } from "@/components/detail/info-layout";
import {
  MetadataSidebar,
  type MetaRow,
} from "@/components/detail/metadata-sidebar";
import { CommunityPanel, CommunityReviews } from "@/components/detail/community-panel";
import { EpisodePanel } from "@/components/detail/episode-panel";
import { SagaStrip } from "@/components/detail/saga-strip";
import { ItemStatusProvider } from "@/components/detail/item-status-context";
import { PassActionsProvider } from "@/components/detail/pass-actions-provider";
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
import { formatPosition, parsePosition } from "@/lib/library/position";
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
import { getNotesForItem } from "@/lib/notes/get-notes";
import { MarginSection } from "@/components/margin/margin-section";
import { getItemMarginNotes } from "@/lib/margin/queries";

import { UNTITLED_FALLBACK } from "@/lib/catalog/untitled";

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
      "id, title, creator, cover_url, backdrop_url, synopsis, release_year, total_seasons, total_episodes, episode_runtime_minutes, genres, tmdb_id, hydrated_at, tmdb_status, next_episode_air_date, episodes_synced_at",
    )
    .eq("id", id)
    .maybeSingle();
}

type SeriesRow = NonNullable<Awaited<ReturnType<typeof fetchSeries>>["data"]>;

type SeriesDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cerrar?: string; tab?: string }>;
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

  // Sin await: en un fallo de caché no se suma en serie a las lecturas de abajo.
  // Nunca rechaza, así que la promesa suelta es segura.
  const workHuePromise = resolveWorkHue({
    coverUrl: series.cover_url,
    title: series.title ?? tDetail("untitled"),
  });

  // La consulta pertenece al render de la ficha; pasar la promesa evita que
  // NotesSection construya un cliente una vez que `after()` ya está activo.
  const notesPromise = user
    ? getNotesForItem(supabase, user.id, "series", series.id)
    : null;
  // Adjunta pronto un consumidor de rechazo sin sustituir la promesa que
  // NotesSection espera más tarde dentro del límite de Tabs.
  void notesPromise?.catch(() => undefined);

  // Misma regla que notesPromise: empieza durante el render, antes de cualquier
  // `after()`, y su rechazo se atiende aquí sin alterar la promesa que espera
  // MarginSection. Sin `use cache`: el resultado depende de quién mira (RLS, #437).
  const marginPromise = user
    ? getItemMarginNotes(supabase, user.id, "series", series.id)
    : null;
  void marginPromise?.catch(() => undefined);

  // Invitación a un visionado conjunto de esta obra sin contestar (#1224): se
  // lanza ya y se espera antes de pintar, en paralelo con lo del hero. Un fallo
  // no tumba la ficha: sin aviso, y la campana sigue llevando a la invitación.
  const jointInvitesPromise = user
    ? getPendingJointInvites(supabase, user.id, { itemType: "series", itemId: series.id }).catch((error) => {
        console.error("getPendingJointInvites failed", error);
        return [];
      })
    : Promise.resolve([]);

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

  const catalogReady = ensureSeriesEpisodes(supabase, {
    id: series.id,
    tmdbId: series.tmdb_id,
    tmdbStatus: series.tmdb_status,
    nextEpisodeAirDate: series.next_episode_air_date,
    episodesSyncedAt: series.episodes_synced_at,
  });

  const [ratingSummary, activePass, shellRole] = await Promise.all([
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


  // `?cerrar` (auto-cierre al terminar una sesión, §Tarea 7): validado aquí
  // contra el pase ACTIVO (`activePass` es la fila `is_active = true` de la
  // consulta del hero) — ver el comentario largo en la ficha de libro
  // (src/app/libro/[id]/page.tsx), mismo mecanismo.
  const initialClosingPassId =
    cerrar && cerrar === activePass?.id ? cerrar : null;

  // El catálogo vacío puede requerir TMDB. En descubrimiento el hero sale ya;
  // con pase, la acción primaria sí espera al cursor real del usuario.
  const episodesPromise = catalogReady.then(() =>
    getEpisodeData(supabase, series.id, user?.id ?? null, activePass?.id ?? null));
  const [jointInvites, workHue] = await Promise.all([jointInvitesPromise, workHuePromise]);
  const passCard = (
    <div className="flex flex-col gap-3">
      <PendingJointInvites invites={jointInvites} variant="item" />
      <PassCard
        itemType="series"
        progress={null}
        rating={activePass?.rating ?? null}
      />
    </div>
  );

  const shell = (
    <ItemShell
      itemType="series"
      mediaLabel={tDetail("mediaLabel.series")}
      title={series.title ?? tDetail("untitled")}
      byline={byline}
      genres={genres}
      coverUrl={series.cover_url}
      workHue={workHue}
      avgRating={ratingSummary.avgRating}
      ratingsLabel={tDetail("ratings", { count: ratingSummary.ratingCount })}
      backLabel={tDetail("back")}
      menuSlot={
        <HeroMenu
          itemType="series"
          itemId={series.id}
          canEditCatalog={canEditCatalog}
        />
      }
      tabs={
        <Suspense fallback={<ItemTabsSkeleton passCard={passCard} />}>
          <SeriesTabs
            passCard={passCard}
            series={series}
            userId={user?.id ?? null}
            notesPromise={notesPromise}
            marginPromise={marginPromise}
            episodesPromise={episodesPromise}
            activeRow={activePass}
            canContribute={canEditCatalog}
            ratingSummary={ratingSummary}
          />
        </Suspense>
      }
    />
  );
  return (
    <ItemStatusProvider initialStatus={activeStatus}>
      <PassActionsProvider
        itemType="series"
        itemId={series.id}
        isLoggedIn={Boolean(user)}
        activePassId={activePass?.id ?? null}
        activePassOpen={
          activePass?.status === "planned" ||
          activePass?.status === "in_progress"
        }
        sessionHref={activePass ? `/serie/${series.id}?tab=log` : null}
        droppedAtLabel={
          activePass
            ? formatPosition("series", parsePosition("series", activePass.position))
            : null
        }
        initialClosingPassId={initialClosingPassId}
      >
        {activePass ? (
          <SeriesEpisodeWorkspace
            key={activePass.id}
            episodes={episodesPromise}
            series={series}
            pass={activePass}
            isLoggedIn
          >
            {shell}
          </SeriesEpisodeWorkspace>
        ) : shell}
      </PassActionsProvider>
    </ItemStatusProvider>
  );
}

type EpisodesPromise = ReturnType<typeof getEpisodeData>;

async function SeriesEpisodeWorkspace({ episodes, series, pass, isLoggedIn, children }: {
  episodes: EpisodesPromise;
  series: SeriesRow;
  pass: { id: string; rating: number | null } | null;
  isLoggedIn: boolean;
  children: ReactNode;
}) {
  const data = await episodes;
  return (
    <EpisodePanel
      seriesId={series.id}
      airing={series.tmdb_status !== null && !data.ended}
      nextAirDate={series.next_episode_air_date}
      pass={pass}
      seasons={data.seasons.map((season) => ({ season, episodes: data.bySeasons.get(season) ?? [] }))}
      isLoggedIn={isLoggedIn}
    >
      {children}
    </EpisodePanel>
  );
}

async function SeriesTabs({
  passCard,
  series,
  userId,
  notesPromise,
  marginPromise,
  ratingSummary,
  episodesPromise, activeRow, canContribute,
}: {
  passCard: React.ReactNode;
  series: SeriesRow;
  userId: string | null;
  notesPromise: ReturnType<typeof getNotesForItem> | null;
  marginPromise: ReturnType<typeof getItemMarginNotes> | null;
  ratingSummary: RatingSummary;
  episodesPromise: EpisodesPromise;
  activeRow: { id: string; status: string; position: unknown } | null;
  canContribute: boolean;
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
  const [enriched, watchProviders, sagas, episodeData, reviewsResult, episodeReviewsResult] =
    await Promise.all([
      ensureItemEnriched(supabase, "series", {
        id: series.id,
        tmdbId: series.tmdb_id,
        // Episodios y duración de episodio se hidratan aquí (misma respuesta
        // que los créditos); sin pasarlos no hay con qué decidir. Ver #365.
        totalEpisodes: series.total_episodes,
        episodeRuntimeMinutes: series.episode_runtime_minutes,
        backdropUrl: series.backdrop_url,
        hydratedAt: series.hydrated_at,
        viewerLoggedIn: Boolean(userId),
      }),
      series.tmdb_id ? getWatchProviders("tv", series.tmdb_id) : null,
      getItemSagas("series", series.id),
      episodesPromise,
      // Reseñas de la comunidad: ~4 roundtrips que solo pinta CommunityPanel;
      // van aquí, detrás del <Suspense> de las pestañas, no en el hero (#439).
      getReviews(supabase, "series", series.id),
      getEpisodeReviews(supabase, series.id),
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
      passes = await getPasses(supabase, "series", series.id, userId);
      entry = {
        entryId: row.id,
        status: row.status as MediaStatus,
        position: parsePosition("series", row.position),
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

  const hasEpisodes = episodeData.seasons.length > 0;

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
  const { reviews: episodeReviews, knownUsernames: episodeKnownUsernames } =
    episodeReviewsResult;

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
  // La tira de la saga principal, a todos los anchos. La serie conserva su
  // umbral de 2 miembros (una tira de una sola portada, la propia, no aporta).
  const stripShown = Boolean(mainSaga) && sagaMembers.length >= 2;

  return (
    <ItemDetailTabs
      passCard={passCard}
      tablistLabel={tDetail("tabsLabel")}
      labels={{
        info: tDetail("tabInfo"),
        ...(hasEpisodes && { episodes: tDetail("tabEpisodes") }),
        community: tDetail("tabCommunity"),
        log: tDetail("tabLog"),
        back: tDetail("backToWork"),
      }}
      stickyAction={
        <StickyPassCta itemType="series" />
      }
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
          {/* Info de la serie (spec ficha cinemática §3). PC: sinopsis →
              reparto → saga | ficha → dónde verla. Móvil, el orden de siempre:
              sagas → sinopsis → reparto → dónde verla → ficha. */}
          <InfoLayout
            main={
              <>
                <div className="order-2 xl:order-none">
                  <InfoPanel
                    aboutLabel={tDetail("about")}
                    synopsis={series.synopsis}
                    noSynopsisLabel={tDetail("noSynopsis")}
                    actions={<EditFichaButton />}
                  />
                </div>
                {(credits.cast.length > 0 || credits.crew.length > 0) && (
                  <div className="order-3 min-w-0 xl:order-none">
                    <CreditsSection credits={credits} />
                  </div>
                )}
                {sagas.length > 0 && (
                  <section className="order-1 flex flex-col gap-3.5 xl:order-none">
                    <span data-section-title className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                      {tDetail("sagasCount", { count: sagas.length })}
                    </span>
                    {stripShown && mainSaga && (
                      <SagaStrip
                        members={sagaMembers}
                        currentType="series"
                        currentId={series.id}
                        sagaId={mainSaga.sagaId}
                        sagaName={mainSaga.name}
                        positionLabel={sagaPosition(mainSaga)}
                      />
                    )}
                    <SagaList
                      itemType="series"
                      sagas={sagas}
                      positionLabel={sagaPosition}
                      stripShown={stripShown}
                    />
                  </section>
                )}
              </>
            }
            aside={
              <>
                <div className="order-5 xl:order-none">
                  <MetadataSidebar
                    rows={metaRows}
                    genres={genres}
                    genresLabel={tDetail("genres")}
                  />
                </div>
                {watchProviders && (
                  <div className="order-4 xl:order-none">
                    <WatchProviders data={watchProviders} />
                  </div>
                )}
              </>
            }
          />
        </CatalogEditor>
      }
      episodes={hasEpisodes ? (
        activeRow ? <EpisodeBrowser /> : (
          <SeriesEpisodeWorkspace
            episodes={episodesPromise} series={series} pass={null}
            isLoggedIn={Boolean(userId)}
          >
            <EpisodeBrowser />
          </SeriesEpisodeWorkspace>
        )
      ) : undefined}
      logPreview={entry?.status === "completed" && <PassDiary activeOnly itemType="series" itemId={series.id} passes={passes} editions={[]} />}
      logLinkLabel={tDetail("viewJournal")}
      community={<CommunityPanel itemType="series" community={community} reviewCount={community.reviews.length + episodeReviews.length} />}
      reviews={
          <CommunityReviews
            itemType="series"
            community={community}
            episodeReviews={episodeReviews}
            episodeKnownUsernames={episodeKnownUsernames}
            viewerLoggedIn={Boolean(userId)}
          />
      }
      log={
        <div className="flex flex-col gap-4">
          <EpisodeJournal />
          <LogPanel
            showMarginAction={Boolean(userId && marginPromise)}
            itemType="series"
            itemId={series.id}
            entry={entry}
            passes={passes}
            sessions={sessions}
            // Las series no tienen ediciones (getEditions ni siquiera
            // consulta la BD para este tipo): no hace falta cargarlas.
            editions={[]}
            currentYear={new Date().getFullYear()}
            canContribute={canContribute}
          />
          {userId && notesPromise && <NotesSection itemType="series" notesPromise={notesPromise} />}
          {userId && marginPromise && (
            <Suspense fallback={null}>
              <MarginSection marginPromise={marginPromise} />
            </Suspense>
          )}
        </div>
      }
    />
  );
}
