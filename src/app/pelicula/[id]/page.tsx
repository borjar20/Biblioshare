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
import { type MetaRow } from "@/components/detail/metadata-sidebar";
import { CommunityPanel } from "@/components/detail/community-panel";
import { SagaStrip } from "@/components/detail/saga-strip";
import { EditionsSection } from "@/components/detail/edition-details";
import { EditionsLoading } from "@/components/detail/editions-loading";
import {
  ItemStatusProvider,
  StatusBadgeLive,
} from "@/components/detail/item-status-context";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getWatchProviders } from "@/lib/catalog/tmdb";
import { getCommunity } from "@/lib/community/get-community";
import { getEditions } from "@/lib/editions/get-editions";
import { ensureItemEnriched } from "@/lib/people/enrich-item";
import { getItemCredits } from "@/lib/people/get-item-credits";
import { getItemSaga } from "@/lib/sagas/get-item-saga";
import { getSaga } from "@/lib/sagas/get-saga";
import type { SagaMember } from "@/lib/sagas/types";
import { parsePosition } from "@/lib/library/position";
import type { MediaStatus } from "@/lib/library/types";
import { getPasses } from "@/lib/passes/get-passes";
import type { Pass } from "@/lib/passes/types";
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
  const { data: movie } = await supabase
    .from("movies")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return { title: movie ? `${movie.title} — Biblioshare` : "Biblioshare" };
}

type Supa = Awaited<ReturnType<typeof createClient>>;

function fetchMovie(supabase: Supa, id: string) {
  return supabase
    .from("movies")
    .select(
      "id, title, director, cover_url, synopsis, release_year, duration_minutes, genres, tmdb_id",
    )
    .eq("id", id)
    .maybeSingle();
}

type MovieRow = NonNullable<Awaited<ReturnType<typeof fetchMovie>>["data"]>;
type Community = Awaited<ReturnType<typeof getCommunity>>;

export default async function MovieDetailPage({
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
    { data: movie },
    {
      data: { user },
    },
  ] = await Promise.all([fetchMovie(supabase, id), supabase.auth.getUser()]);

  if (!movie) notFound();

  // Lo mínimo para pintar el hero: nota media y estado del pase activo. El
  // resto (reparto, plataformas de TMDB, saga, ediciones, pases) llega por
  // streaming en las pestañas — Fase B del plan de navegación.
  // El pase activo entero: el rail de PC enseña también la nota (y el
  // progreso donde lo hay). Misma consulta, mismo viaje.
  const [community, activePass] = await Promise.all([
    getCommunity(supabase, "movie", movie.id),
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
  ]);
  const activeStatus = (activePass?.status as MediaStatus | undefined) ?? null;

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
        title={movie.title}
        byline={byline}
        genres={genres}
        coverUrl={movie.cover_url}
        avgRating={community.avgRating}
        ratingCount={community.ratingCount}
        ratingsLabel={tDetail("ratings")}
        backLabel={tDetail("back")}
        statusSlot={<StatusBadgeLive labels={statusLabels} />}
        railActions={
          <ItemRailActions
            itemType="movie"
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
              community={community}
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
  community,
  cerrar,
}: {
  movie: MovieRow;
  userId: string | null;
  community: Community;
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
  const [watchProviders, , saga, editions, activeRow, loadedQueues, role] =
    await Promise.all([
      movie.tmdb_id ? getWatchProviders("movie", movie.tmdb_id) : null,
      ensureItemEnriched(supabase, "movie", {
        id: movie.id,
        tmdbId: movie.tmdb_id,
      }),
      getItemSaga(supabase, "movie", movie.id),
      getEditions(supabase, "movie", movie.id),
      // "En mi biblioteca" = existe pase ACTIVO de la obra (§Tarea 9, hub).
      userId
        ? supabase
            .from("passes")
            .select("id, status, rating, position, queue_id")
            .eq("user_id", userId)
            .eq("item_type", "movie")
            .eq("item_id", movie.id)
            .eq("is_active", true)
            .maybeSingle()
            .then(({ data }) => data)
        : null,
      userId ? getQueues(supabase, userId) : [],
      userId ? getCurrentUserRole(supabase) : null,
    ]);

  // Lo único que de verdad esperaba a ensureItemEnriched.
  const credits = await getItemCredits(supabase, "movie", movie.id);

  let entry: ManagedEntry | null = null;
  let passes: Pass[] = [];
  const queues: Queue[] = loadedQueues;
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
      queueId: activeRow.queue_id,
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

  const metaRows: MetaRow[] = [];
  if (movie.director)
    metaRows.push({ label: tMeta("director"), value: movie.director });
  if (movie.release_year)
    metaRows.push({ label: tMeta("year"), value: String(movie.release_year) });

  const genres = movie.genres ?? [];

  let sagaMembers: SagaMember[] = [];
  if (saga) {
    const full = await getSaga(supabase, saga.sagaId);
    sagaMembers = full?.members ?? [];
  }

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
            title: movie.title,
            author: movie.director,
            synopsis: movie.synopsis,
            genres,
            year: movie.release_year,
            coverUrl: movie.cover_url,
          }}
          editions={editions}
          saga={saga ? { id: saga.sagaId, name: saga.name } : null}
          canContribute={canContribute}
        >
          <div className="flex flex-col gap-10">
            {saga && sagaMembers.length >= 1 && (
              <SagaStrip
                members={sagaMembers}
                currentType="movie"
                currentId={movie.id}
                sagaId={saga.sagaId}
                sagaName={saga.name}
                label={tDetail("saga")}
              />
            )}
            {/* La sinopsis va DENTRO de EditionsSection: el mockup la pone
                  entre la tira de ediciones y el panel de metadatos, y así los
                  dos comparten el estado de "qué edición miro". */}
            <EditionsSection
              itemType="movie"
              itemId={movie.id}
              editionsPromise={Promise.resolve(editions)}
              editionsFallback={<EditionsLoading />}
              selectedEditionId={
                passes.find((p) => !p.finishedOn)?.editionId ?? null
              }
              canContribute={canContribute}
              workRows={metaRows}
              genres={genres}
              genresLabel={tDetail("genres")}
            >
              <InfoPanel
                aboutLabel={tDetail("about")}
                synopsis={movie.synopsis}
                noSynopsisLabel={tDetail("noSynopsis")}
                actions={<EditFichaButton />}
                extra={
                  <>
                    <CreditsSection credits={credits} />
                    {watchProviders && <WatchProviders data={watchProviders} />}
                  </>
                }
              />
            </EditionsSection>
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
        <LogPanel
          itemType="movie"
          itemId={movie.id}
          entry={entry}
          passes={passes}
          sessions={[]}
          editions={editions}
          queues={queues}
          initialClosingPassId={initialClosingPassId}
        />
      }
    />
  );
}
