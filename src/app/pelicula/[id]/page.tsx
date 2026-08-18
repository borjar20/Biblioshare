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
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { ItemTabsSkeleton } from "@/components/detail/item-tabs-skeleton";
import { ItemShellSkeleton } from "@/components/detail/item-shell-skeleton";
import { RouteMessages } from "@/components/route-messages";

// Namespaces de cliente de la ficha (medidos por su subárbol, #444).
const DETAIL_NS = [
  "catalogEdit", "collection", "detail", "editions",
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
import { SagaStrip } from "@/components/detail/saga-strip";
import { EditionsSection } from "@/components/detail/edition-details";
import { EditionsLoading } from "@/components/detail/editions-loading";
import { ItemStatusProvider } from "@/components/detail/item-status-context";
import { HeroStatusOrFollow } from "@/components/detail/hero-status-or-follow";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getWatchProviders } from "@/lib/catalog/tmdb";
import { ensureMovieHydrated } from "@/lib/catalog/hydrate-screen";
import {
  getRatingSummary,
  getReviews,
  type Community,
  type RatingSummary,
} from "@/lib/community/get-community";
import { getEditions } from "@/lib/editions/get-editions";
import { getUsedEditionIds } from "@/lib/editions/get-used-edition-ids";
import { ensureItemEnriched } from "@/lib/people/enrich-item";
import { getItemCredits } from "@/lib/people/get-item-credits";
import { getItemSagas } from "@/lib/sagas/get-item-sagas";
import { SagaList } from "@/components/detail/saga-list";
import { getSaga } from "@/lib/sagas/get-saga";
import type { SagaMember, SagaMembership } from "@/lib/sagas/types";
import { parsePosition } from "@/lib/library/position";
import type { MediaStatus } from "@/lib/library/types";
import { getPasses } from "@/lib/passes/get-passes";
import type { Pass } from "@/lib/passes/types";
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
  const { data: movie } = await supabase
    .from("movies")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return { title: movie ? `${movie.title ?? UNTITLED_FALLBACK} — Biblioshare` : "Biblioshare" };
}

type Supa = Awaited<ReturnType<typeof createClient>>;

function fetchMovie(supabase: Supa, id: string) {
  return supabase
    .from("movies")
    .select(
      "id, title, director, cover_url, synopsis, release_year, duration_minutes, genres, tmdb_id, hydrated_at",
    )
    .eq("id", id)
    .maybeSingle();
}

type MovieRow = NonNullable<Awaited<ReturnType<typeof fetchMovie>>["data"]>;

// "2h 35m" como escribe la maqueta (o "47m" si no llega a la hora).
function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type MovieDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cerrar?: string }>;
};

// Página síncrona: `params`/`searchParams` bajan a MovieDetail, por DEBAJO del
// <Suspense> (#442). Ver /libro para el porqué.
export default function MovieDetailPage(props: MovieDetailProps) {
  return (
    <Suspense fallback={<ItemShellSkeleton itemType="movie" />}>
      <RouteMessages ns={DETAIL_NS}>
        <MovieDetail {...props} />
      </RouteMessages>
    </Suspense>
  );
}

async function MovieDetail({ params, searchParams }: MovieDetailProps) {
  const { id } = await params;
  const { cerrar } = await searchParams;
  const tDetail = await getTranslations("detail");
  const supabase = await createClient();

  const [{ data: movie }, user] = await Promise.all([
    fetchMovie(supabase, id),
    getCurrentUser(),
  ]);

  if (!movie) notFound();

  // Hidratación de la OBRA (TMDB): se resuelve en after() porque es una API
  // externa que escribe. Lo normal es que la fila ya llegue hidratada
  // (openCatalogItem hidrata al pulsar el resultado), así que esto es sobre
  // todo curador de filas viejas (`hydrated_at` null). Mismo criterio que
  // ensureBookHydrated en libro/[id]/page.tsx — ver el comentario ahí.
  //
  // Solo con sesión: un visitante anónimo no puede escribir (grant de
  // `authenticated`).
  if (user) {
    after(() =>
      ensureMovieHydrated(supabase, {
        id: movie.id,
        tmdb_id: movie.tmdb_id,
        hydrated_at: movie.hydrated_at,
      }),
    );
  }

  // Lo mínimo para pintar el hero: nota media y estado del pase activo. El
  // resto (reparto, plataformas de TMDB, saga, ediciones, pases) llega por
  // streaming en las pestañas — Fase B del plan de navegación.
  // El pase activo entero: el rail de PC enseña también la nota (y el
  // progreso donde lo hay). Misma consulta, mismo viaje.
  // El rol viaja en el mismo Promise.all (paralelo, coste cero en serie): el
  // menú ⋯ del hero (P2) necesita saber si puede ofrecer "Editar ficha".
  const [ratingSummary, activePass, shellRole] = await Promise.all([
    getRatingSummary("movie", movie.id),
    user
      ? supabase
          .from("passes")
          .select("id, status, rating, position")
          .eq("user_id", user.id)
          .eq("item_type", "movie")
          .eq("item_id", movie.id)
          .eq("is_active", true)
          .maybeSingle()
          .then(({ data }) => data)
      : Promise.resolve(null),
    user ? getCurrentUserRole(supabase) : Promise.resolve(null),
  ]);
  const activeStatus = (activePass?.status as MediaStatus | undefined) ?? null;
  const canEditCatalog = hasMinRole(shellRole, "collaborator");

  // La duración es de la VERSIÓN (movie_versions), no de la obra: no va en el
  // byline del hero. Ya se ve en el panel de la edición (EditionDetails).
  const byline =
    [
      movie.director || null,
      movie.release_year ? String(movie.release_year) : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  const genres = movie.genres ?? [];

  // Las 4 etiquetas de la píldora del hero ("En tu biblioteca · Viendo"),
  // traducidas aquí para que la isla de cliente (StatusBadgeLive) no arrastre
  // i18n. El provider comparte el estado del pase activo entre el badge del
  // hero y los pills de la pestaña Registro: ambos cambian en el mismo commit
  // optimista (ver item-status-context.tsx).
  const statusLabels = await heroStatusLabels("movie");

  // El rail de PC, solo lectura (ver item-rail-actions.tsx). La película NO
  // lleva barra de progreso: su estado es binario y el frame 12 no la pinta.
  const railLabels = await statusVerbs("movie");

  return (
    <ItemStatusProvider initialStatus={activeStatus}>
      <ItemShell
        itemType="movie"
        mediaLabel={tDetail("mediaLabel.movie")}
        title={movie.title ?? tDetail("untitled")}
        byline={byline}
        genres={genres}
        coverUrl={movie.cover_url}
        avgRating={ratingSummary.avgRating}
        ratingsLabel={tDetail("ratings", { count: ratingSummary.ratingCount })}
        backLabel={tDetail("back")}
        statusSlot={
          <HeroStatusOrFollow
            itemType="movie"
            itemId={movie.id}
            isLoggedIn={Boolean(user)}
            statusLabels={statusLabels}
          />
        }
        menuSlot={
          <HeroMenu
            itemType="movie"
            itemId={movie.id}
            canEditCatalog={canEditCatalog}
          />
        }
        railActions={
          <ItemRailActions
            itemType="movie"
            itemId={movie.id}
            isLoggedIn={Boolean(user)}
            labels={railLabels}
            progress={null}
            rating={activePass?.rating ?? null}
            ctaHref={activePass ? `/pelicula/${movie.id}?tab=log` : null}
            ctaLabel={tDetail("rail.cta.movie")}
            ratingLabel={tDetail("rail.yourRating")}
            goToLogLabel={tDetail("rail.goToLog")}
          />
        }
        tabs={
          <Suspense fallback={<ItemTabsSkeleton />}>
            <MovieTabs
              movie={movie}
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

// Las pestañas: backfill de personas, plataformas de TMDB (API externa),
// créditos, saga, ediciones y pases — todo detrás del <Suspense> del hero.
async function MovieTabs({
  movie,
  userId,
  ratingSummary,
  cerrar,
}: {
  movie: MovieRow;
  userId: string | null;
  ratingSummary: RatingSummary;
  cerrar?: string;
}) {
  const supabase = await createClient();
  const tDetail = await getTranslations("detail");
  const tMeta = await getTranslations("detail.meta");

  // Ojo al ORDEN (mismo criterio que la ficha de libro): con Supabase remoto
  // —también en producción— cada consulta cuesta ~240 ms de ida y vuelta, así
  // que lo que manda no es cuántas hay sino cuántas van EN FILA. La única
  // dependencia real aquí es que ensureItemEnriched escribe lo que
  // getItemCredits lee; el resto va en paralelo aunque se lea en orden.
  const [watchProviders, , sagas, editions, activeRow, role, reviewsResult] =
    await Promise.all([
      movie.tmdb_id ? getWatchProviders("movie", movie.tmdb_id) : null,
      ensureItemEnriched(supabase, "movie", {
        id: movie.id,
        tmdbId: movie.tmdb_id,
        // La duración se hidrata aquí (misma respuesta que los créditos); sin
        // pasarla no habría con qué decidir si ya está. Ver #365.
        durationMinutes: movie.duration_minutes,
      }),
      getItemSagas("movie", movie.id),
      getEditions("movie", movie.id),
      // "En mi biblioteca" = existe pase ACTIVO de la obra (§Tarea 9, hub).
      userId
        ? supabase
            .from("passes")
            .select("id, status, rating, position")
            .eq("user_id", userId)
            .eq("item_type", "movie")
            .eq("item_id", movie.id)
            .eq("is_active", true)
            .maybeSingle()
            .then(({ data }) => data)
        : null,
        userId ? getCurrentUserRole(supabase) : null,
      // Reseñas de la comunidad: ~4 roundtrips que solo pinta CommunityPanel;
      // van aquí, detrás del <Suspense> de las pestañas, no en el hero (#439).
      getReviews(supabase, "movie", movie.id),
    ]);

  // Community que espera CommunityPanel = el agregado (ya resuelto en el hero)
  // más las reseñas (aquí).
  const community: Community = { ...ratingSummary, ...reviewsResult };

  // Lo único que de verdad esperaba a ensureItemEnriched.
  const credits = await getItemCredits("movie", movie.id);

  let entry: ManagedEntry | null = null;
  let passes: Pass[] = [];
  if (userId && activeRow) {
    // La nota (notes) sale de pass_reviews (privacidad ya aplicada) — ningún
    // consumidor de ManagedEntry la renderiza hoy, pero se resuelve igualmente
    // para no dejar el campo con un dato inventado.
    //
    // pass_reviews y getPasses no se necesitan entre sí: en paralelo.
    const [reviewRow, loadedPasses] = await Promise.all([
      supabase
        .from("pass_reviews")
        .select("review")
        .eq("id", activeRow.id)
        .maybeSingle()
        .then(({ data }) => data),
      getPasses(supabase, "movie", movie.id, userId),
    ]);
    passes = loadedPasses;
    entry = {
      entryId: activeRow.id,
      status: activeRow.status as MediaStatus,
      rating: activeRow.rating,
      position: parsePosition("movie", activeRow.position),
      notes: reviewRow?.review ?? null,
    };
  }

  // `?cerrar` (auto-cierre al terminar una sesión, §Tarea 7): validado aquí
  // contra el pase ACTIVO — ver el comentario largo en la ficha de libro
  // (src/app/libro/[id]/page.tsx), mismo mecanismo. Las películas no generan
  // sesiones (§7.14) así que este path solo importa por el manual "marcar
  // completado", que no depende de la URL — se deja aquí por consistencia y
  // para que un `?cerrar` forjado tampoco reabra nada.
  const activePassId = passes.find((p) => p.isActive)?.id ?? null;
  const initialClosingPassId =
    cerrar && cerrar === activePassId ? cerrar : null;

  // El rol ya viaja resuelto desde el bloque paralelo de arriba.
  const canContribute = role ? hasMinRole(role, "collaborator") : false;

  // Mismo criterio que en la ficha de libro (borrado rápido de versiones): solo
  // colaborador+ paga la consulta. Aquí las ediciones ya vienen resueltas —no
  // hay sync externo que esperar—, así que la promesa es directa.
  const usedEditionIdsPromise = canContribute
    ? getUsedEditionIds(
        supabase,
        editions.map((e) => e.id),
      )
    : Promise.resolve<string[]>([]);

  const metaRows: MetaRow[] = [];
  if (movie.director)
    metaRows.push({ label: tMeta("director"), value: movie.director });
  if (movie.release_year)
    metaRows.push({ label: tMeta("year"), value: String(movie.release_year) });
  // La duración de la OBRA (frame 12: "Duración · 2h 35m"). La de cada versión
  // sigue en su tarjeta; esta es la de referencia que trae TMDB.
  if (movie.duration_minutes)
    metaRows.push({
      label: tMeta("runtime"),
      value: formatRuntime(movie.duration_minutes),
    });

  const genres = movie.genres ?? [];

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
      itemType="movie"
      labels={{
        info: tDetail("tabInfo"),
        community: tDetail("tabCommunity"),
        log: tDetail("tabLog"),
      }}
      info={
        <CatalogEditor
          itemType="movie"
          itemId={movie.id}
          item={{
            title: movie.title ?? tDetail("untitled"),
            author: movie.director,
            synopsis: movie.synopsis,
            genres,
            year: movie.release_year,
            coverUrl: movie.cover_url,
          }}
          editions={editions}
          sagas={sagas.map((s) => ({ sagaId: s.sagaId, name: s.name, isPrimary: s.isPrimary }))}
          canContribute={canContribute}
        >
          {/* Frames 5 (móvil) y 12 (PC), y son órdenes DISTINTOS con el mismo
              DOM (`display:contents` + `order`, como el Registro):
                móvil → sagas, sinopsis, versiones, reparto, dónde verla, ficha
                PC    → reparto A LO ANCHO primero (rejilla de 6), y debajo las
                        dos columnas: sinopsis, dónde verla y versiones a la
                        izquierda; la ficha técnica a la derecha.
              La sinopsis se queda en el cuerpo también en PC (P9, decidido).
              Todo es servidor y sin estado: reordenar no duplica nada. */}
          <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-11 lg:gap-y-9">
            {(credits.cast.length > 0 || credits.crew.length > 0) && (
              <div className="order-4 lg:order-none lg:col-span-2">
                <CreditsSection credits={credits} />
              </div>
            )}

            <div className="contents lg:flex lg:flex-col lg:gap-10">
              {sagas.length > 0 && (
                <section className="order-1 flex flex-col gap-3.5 lg:order-none">
                  <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                    {tDetail("sagasCount", { count: sagas.length })}
                  </span>
                  {mainSaga && sagaMembers.length >= 1 && (
                    <div className="lg:hidden">
                      <SagaStrip
                        members={sagaMembers}
                        currentType="movie"
                        currentId={movie.id}
                        sagaId={mainSaga.sagaId}
                        sagaName={mainSaga.name}
                        positionLabel={sagaPosition(mainSaga)}
                      />
                    </div>
                  )}
                  <SagaList
                    itemType="movie"
                    sagas={sagas}
                    positionLabel={sagaPosition}
                  />
                </section>
              )}
              <div className="order-2 lg:order-none">
                <InfoPanel
                  aboutLabel={tDetail("about")}
                  synopsis={movie.synopsis}
                  noSynopsisLabel={tDetail("noSynopsis")}
                  actions={<EditFichaButton />}
                />
              </div>
              {watchProviders && (
                <div className="order-5 lg:order-none">
                  <WatchProviders data={watchProviders} />
                </div>
              )}
              <div className="order-3 lg:order-none">
                <EditionsSection
                  itemType="movie"
                  itemId={movie.id}
                  editionsPromise={Promise.resolve(editions)}
                  usedEditionIdsPromise={usedEditionIdsPromise}
                  editionsFallback={<EditionsLoading />}
                  selectedEditionId={
                    passes.find((p) => !p.finishedOn)?.editionId ?? null
                  }
                  canContribute={canContribute}
                />
              </div>
            </div>

            <div className="order-6 lg:order-none">
              <MetadataSidebar
                rows={metaRows}
                genres={genres}
                genresLabel={tDetail("genres")}
              />
            </div>
          </div>
        </CatalogEditor>
      }
      community={
        <div className="flex flex-col gap-10">
          <CommunityPanel
            itemType="movie"
            community={community}
            viewerLoggedIn={Boolean(userId)}
          />
        </div>
      }
      log={
        <div className="flex flex-col gap-4">
          <LogPanel
            itemType="movie"
            itemId={movie.id}
            entry={entry}
            passes={passes}
            sessions={[]}
            editions={editions}
            initialClosingPassId={initialClosingPassId}
            canContribute={canContribute}
          />
          {userId && <NotesSection userId={userId} itemType="movie" itemId={movie.id} />}
        </div>
      }
    />
  );
}
