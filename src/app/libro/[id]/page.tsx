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
import {
  CatalogEditor,
  EditFichaButton,
} from "@/components/detail/catalog-editor";
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
import { ItemStatusProvider } from "@/components/detail/item-status-context";
import { HeroStatusOrFollow } from "@/components/detail/hero-status-or-follow";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import {
  getRatingSummary,
  getReviews,
  type Community,
  type RatingSummary,
} from "@/lib/community/get-community";
import { getEditions } from "@/lib/editions/get-editions";
import { loadBookEditions } from "@/lib/editions/load-editions";
import { getUsedEditionIds } from "@/lib/editions/get-used-edition-ids";
import { EditionsLoading } from "@/components/detail/editions-loading";
import { ensureBookHydrated } from "@/lib/catalog/hydrate-book";
import { ensureItemEnriched } from "@/lib/people/enrich-item";
import { getItemCredits } from "@/lib/people/get-item-credits";
import { personHref } from "@/lib/catalog/item-href";
import { getItemSagas } from "@/lib/sagas/get-item-sagas";
import { SagaList } from "@/components/detail/saga-list";
import { getSaga } from "@/lib/sagas/get-saga";
import type { SagaMember, SagaMembership } from "@/lib/sagas/types";
import { parsePosition, type BookPosition } from "@/lib/library/position";
import { getSessions } from "@/lib/sessions/get-sessions";
import type { ProgressSession } from "@/lib/sessions/types";
import { getPasses } from "@/lib/passes/get-passes";
import type { Pass } from "@/lib/passes/types";
import type { MediaStatus } from "@/lib/library/types";
import { NotesSection } from "@/components/notes/notes-section";

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
  const { data: book } = await supabase
    .from("books")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return { title: book ? `${book.title} — Biblioshare` : "Biblioshare" };
}

type Supa = Awaited<ReturnType<typeof createClient>>;

function fetchBook(supabase: Supa, id: string) {
  return supabase
    .from("books")
    .select(
      "id, title, author, cover_url, synopsis, published_year, publisher, total_pages, isbn, genres, openlibrary_work_key, editions_synced_at, hydrated_at",
    )
    .eq("id", id)
    .maybeSingle();
}

type BookRow = NonNullable<Awaited<ReturnType<typeof fetchBook>>["data"]>;

type BookDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cerrar?: string }>;
};

// La página es SÍNCRONA y solo pinta el armazón + el boundary: la lectura de
// `params`/`searchParams` baja a BookDetail, por DEBAJO del <Suspense> (#442).
// Así el App Shell no queda atado a una URL concreta y la ficha puede tener
// shell estático compartido por todos los enlaces a /libro/*.
export default function BookDetailPage(props: BookDetailProps) {
  return (
    <Suspense fallback={<ItemShellSkeleton itemType="book" />}>
      <RouteMessages ns={DETAIL_NS}>
        <BookDetail {...props} />
      </RouteMessages>
    </Suspense>
  );
}

async function BookDetail({ params, searchParams }: BookDetailProps) {
  const { id } = await params;
  const { cerrar } = await searchParams;
  const tDetail = await getTranslations("detail");
  const supabase = await createClient();

  const [{ data: book }, user] = await Promise.all([
    fetchBook(supabase, id),
    getCurrentUser(),
  ]);

  if (!book) notFound();

  // Hidratación de la OBRA (sinopsis y géneros desde /works/<key>.json): se
  // resuelve en after() porque es una API externa que escribe. Lo normal es
  // que la fila ya llegue hidratada (openCatalogItem hidrata al pulsar el
  // resultado), así que esto es sobre todo curador de filas viejas (`hydrated_at`
  // null) que se arreglan solas la primera vez que se abren.
  //
  // Las EDICIONES ya NO se sincronizan aquí en after(): se resuelven por
  // streaming vía loadBookEditions (ver editionsPromise, dentro del <Suspense>
  // de EditionsSection), así que la primera visita SÍ las ve tras el streaming.
  //
  // Solo con sesión: un visitante anónimo no puede escribir — el grant es de
  // `authenticated`. Sin este guardia, cada visita anónima a una ficha sin
  // hidratación programaría en segundo plano hasta cinco llamadas a
  // OpenLibrary, todo para tirarlo a la basura.
  if (user) {
    after(() =>
      ensureBookHydrated(supabase, {
        id: book.id,
        openlibrary_work_key: book.openlibrary_work_key,
        isbn: book.isbn,
        hydrated_at: book.hydrated_at,
      }),
    );
  }

  // Lo mínimo para pintar el hero: la nota media de la comunidad y el estado
  // del pase activo. Todo lo demás (créditos, saga, ediciones, pases, sesiones,
  // colas) vive en las pestañas y llega por streaming — Fase B del plan de
  // navegación: la primera visita ya no espera al backfill ni a las ediciones.
  // El pase activo se lee ENTERO (no solo el estado): el rail de PC enseña
  // también progreso y nota, y salen de esta misma fila — misma consulta, mismo
  // viaje. Con Supabase remoto lo caro es la ida y vuelta, no las columnas.
  // El rol viaja en el mismo Promise.all (paralelo, coste cero en serie): el
  // menú ⋯ del hero (P2) necesita saber si puede ofrecer "Editar ficha".
  const [ratingSummary, activePass, shellRole] = await Promise.all([
    getRatingSummary("book", book.id),
    user
      ? supabase
          .from("passes")
          .select("id, status, rating, position")
          .eq("user_id", user.id)
          .eq("item_type", "book")
          .eq("item_id", book.id)
          .eq("is_active", true)
          .maybeSingle()
          .then(({ data }) => data)
      : Promise.resolve(null),
    user ? getCurrentUserRole(supabase) : Promise.resolve(null),
  ]);
  const activeStatus = (activePass?.status as MediaStatus | undefined) ?? null;
  const canEditCatalog = hasMinRole(shellRole, "collaborator");

  // El byline del hero sale de la propia fila (autor + año): los créditos
  // enriquecidos dan el mismo texto y no merece la pena bloquear el hero por
  // ellos — se usan dentro de las pestañas para enlazar a la ficha del autor.
  const byline =
    [
      book.author || null,
      book.published_year ? String(book.published_year) : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  const genres = book.genres ?? [];

  // Las 4 etiquetas de la píldora del hero ("En tu biblioteca · Leyendo"),
  // traducidas aquí para que la isla de cliente (StatusBadgeLive) no arrastre
  // i18n. El provider comparte el estado del pase activo entre el badge del
  // hero y los pills de la pestaña Registro: ambos cambian en el mismo commit
  // optimista (ver item-status-context.tsx).
  const statusLabels = await heroStatusLabels("book");

  // El rail de PC (solo lectura, ver item-rail-actions.tsx). La barra de
  // progreso solo tiene sentido con total de páginas conocido.
  const railLabels = await statusVerbs("book");
  const bookPosition = parsePosition(
    "book",
    activePass?.position,
  ) as BookPosition;
  const currentPage = bookPosition.page ?? 0;
  const totalPages = book.total_pages ?? 0;
  const railProgress =
    totalPages > 0
      ? {
          percent: Math.min(100, Math.round((currentPage / totalPages) * 100)),
          left: tDetail("rail.pages", { page: currentPage, total: totalPages }),
          right: `${Math.min(100, Math.round((currentPage / totalPages) * 100))}%`,
        }
      : null;

  return (
    <ItemStatusProvider initialStatus={activeStatus}>
      <ItemShell
        itemType="book"
        mediaLabel={tDetail("mediaLabel.book")}
        title={book.title}
        byline={byline}
        genres={genres}
        coverUrl={book.cover_url}
        avgRating={ratingSummary.avgRating}
        ratingsLabel={tDetail("ratings", { count: ratingSummary.ratingCount })}
        backLabel={tDetail("back")}
        statusSlot={
          <HeroStatusOrFollow
            itemType="book"
            itemId={book.id}
            isLoggedIn={Boolean(user)}
            statusLabels={statusLabels}
          />
        }
        menuSlot={
          <HeroMenu
            itemType="book"
            itemId={book.id}
            canEditCatalog={canEditCatalog}
          />
        }
        railActions={
          <ItemRailActions
            itemType="book"
            itemId={book.id}
            isLoggedIn={Boolean(user)}
            labels={railLabels}
            progress={railProgress}
            rating={activePass?.rating ?? null}
            ctaHref={activePass ? `/sesion/${activePass.id}` : null}
            ctaLabel={tDetail("rail.cta.book")}
            ratingLabel={tDetail("rail.yourRating")}
            goToLogLabel={tDetail("rail.goToLog")}
          />
        }
        tabs={
          <Suspense fallback={<ItemTabsSkeleton />}>
            <BookTabs
              book={book}
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

// Las pestañas: aquí vive todo lo pesado (backfill de personas, créditos, saga,
// ediciones, pases, sesiones y colas), detrás del <Suspense> del hero.
async function BookTabs({
  book,
  userId,
  ratingSummary,
  cerrar,
}: {
  book: BookRow;
  userId: string | null;
  ratingSummary: RatingSummary;
  cerrar?: string;
}) {
  const supabase = await createClient();
  const tDetail = await getTranslations("detail");
  const tMeta = await getTranslations("detail.meta");

  // Ojo al ORDEN de esta sección: con Supabase remoto (también en producción)
  // cada consulta cuesta ~240 ms de ida y vuelta, así que lo que manda no es
  // cuántas hay, sino cuántas van EN FILA. Aquí solo hay dos dependencias
  // reales: ensureItemEnriched escribe lo que getItemCredits lee, y getSessions
  // necesita saber el pase abierto. Todo lo demás va en paralelo aunque el
  // código lo lea en orden.
  const [, sagas, editions, activeRow, role, reviewsResult] = await Promise.all([
    // Créditos (autor): backfill puntual de personas, no una API externa
    // paginada — y getItemCredits, más abajo, necesita que ya haya escrito.
    ensureItemEnriched(supabase, "book", { id: book.id, author: book.author }),
    getItemSagas("book", book.id),
    getEditions("book", book.id),
    // "En mi biblioteca" = existe pase ACTIVO de la obra (§Tarea 9, hub):
    // status/rating/position viven en passes, library_entries ya no
    // se lee.
    userId
      ? supabase
          .from("passes")
          .select("id, status, rating, position")
          .eq("user_id", userId)
          .eq("item_type", "book")
          .eq("item_id", book.id)
          .eq("is_active", true)
          .maybeSingle()
          .then(({ data }) => data)
      : null,
    userId ? getCurrentUserRole(supabase) : null,
    // Reseñas de la comunidad: ~4 roundtrips que solo pinta CommunityPanel; van
    // aquí, detrás del <Suspense> de las pestañas, no en el hero (#439).
    getReviews(supabase, "book", book.id),
  ]);

  // Community que espera CommunityPanel = el agregado (ya resuelto en el hero)
  // más las reseñas (aquí).
  const community: Community = { ...ratingSummary, ...reviewsResult };

  // Lo único que de verdad esperaba a ensureItemEnriched.
  const credits = await getItemCredits("book", book.id);

  // Ediciones del DISPLAY: se resuelven por streaming (sync-si-hace-falta + lee)
  // dentro del <Suspense> de EditionsSection. NO se await aquí: eso bloquearía la
  // página, que es justo lo que evitábamos con after().
  const editionsPromise = loadBookEditions(
    supabase,
    {
      id: book.id,
      openlibrary_work_key: book.openlibrary_work_key,
      isbn: book.isbn,
      editions_synced_at: book.editions_synced_at,
    },
    Boolean(userId),
  );
  // Autores como enlaces a su ficha; si no se pudo enriquecer, texto plano.
  const authorCredits = credits.crew.filter((c) => c.role === "author");

  let entry: ManagedEntry | null = null;
  let sessions: ProgressSession[] = [];
  let passes: Pass[] = [];
  if (userId && activeRow) {
    // La nota (notes) sale de pass_reviews (privacidad ya aplicada) — ningún
    // consumidor de ManagedEntry la renderiza hoy, pero se resuelve igualmente
    // para no dejar el campo con un dato inventado.
    //
    // pass_reviews y getPasses no se necesitan entre sí: solo dependen del pase
    // activo, que ya lo tenemos. En paralelo.
    const [reviewRow, loadedPasses] = await Promise.all([
      supabase
        .from("pass_reviews")
        .select("review")
        .eq("id", activeRow.id)
        .maybeSingle()
        .then(({ data }) => data),
      getPasses(supabase, "book", book.id, userId),
    ]);
    passes = loadedPasses;
    entry = {
      entryId: activeRow.id,
      status: activeRow.status as MediaStatus,
      rating: activeRow.rating,
      position: parsePosition("book", activeRow.position),
      notes: reviewRow?.review ?? null,
    };
    // Las sesiones son del pase ABIERTO, no de toda la entrada (Hallazgo 4):
    // en una relectura, las sesiones de la lectura anterior no deben colarse
    // bajo el cartel de la edición del pase nuevo. Esta sí espera a getPasses:
    // getSessions necesita saber cuál es el pase abierto.
    //
    // El pase abierto si lo hay; si ya terminaste, el último cerrado. Sin ese
    // segundo caso, la lista de sesiones de un libro leído se quedaría vacía
    // para siempre: getPasses ordena el abierto primero y luego los cerrados
    // de más reciente a más antiguo, así que passes[0] es el que toca.
    const currentPassId =
      passes.find((p) => p.finishedOn === null)?.id ?? passes[0]?.id ?? null;
    sessions = await getSessions(supabase, currentPassId, "book");
  }

  // `?cerrar` (auto-cierre al terminar una sesión, §Tarea 7): validado aquí,
  // en el server component, contra el pase ACTIVO — nunca uno archivado, para
  // que un `?cerrar` forjado con un pase viejo ya cerrado no reabra su hoja
  // (hallazgo de seguridad f35106b). Al calcularse en el servidor y viajar
  // como prop, la hoja de cierre se abre desde el PRIMER pintado, sin el
  // rezago de un render que sufre useSearchParams tras el redirect de la
  // server action (hallazgo de revisión de la Tarea 7).
  const activePassId = passes.find((p) => p.isActive)?.id ?? null;
  const initialClosingPassId =
    cerrar && cerrar === activePassId ? cerrar : null;

  // Asignar saga a mano es contribución curada → colaborador+ (§7.35). El rol
  // ya viaja resuelto desde el bloque paralelo de arriba.
  const canContribute = role ? hasMinRole(role, "collaborator") : false;

  // Borrado rápido de ediciones (colaborador+): saber cuáles tienen pases para
  // no ofrecer un borrado que el trigger va a rechazar. Solo se paga la
  // consulta si quien mira puede borrar. Se ENCADENA sobre editionsPromise en
  // vez de esperarla: así el dato viaja por el mismo <Suspense> que la tira y
  // no bloquea la página.
  const usedEditionIdsPromise = canContribute
    ? editionsPromise.then((eds) =>
        getUsedEditionIds(
          supabase,
          eds.map((e) => e.id),
        ),
      )
    : Promise.resolve<string[]>([]);

  const authorNames =
    authorCredits.length > 0
      ? authorCredits.map((a) => a.name)
      : book.author
        ? [book.author]
        : [];

  // Editorial, páginas e ISBN son datos de la EDICIÓN (tirada concreta), no
  // de la obra: se muestran en el panel de la edición (EditionDetails), no
  // aquí. El año que se queda en la obra es el de primera publicación.
  const metaRows: MetaRow[] = [];
  // El autor enlaza a su ficha de persona: es el ÚNICO acceso desde un libro a
  // `/persona/[id]` (película y serie llegan por CreditsSection). Si el libro no
  // se pudo enriquecer, `authorCredits` está vacío y la fila se queda en texto
  // plano — nunca se pinta un enlace sin `people.id` detrás.
  if (authorNames.length > 0)
    metaRows.push({
      label: tMeta("author"),
      value: authorNames.join(", "),
      links:
        authorCredits.length > 0
          ? authorCredits.map((a) => ({ href: personHref(a.id), label: a.name }))
          : undefined,
    });
  if (book.published_year)
    metaRows.push({
      label: tMeta("firstPublished"),
      value: String(book.published_year),
    });

  const genres = book.genres ?? [];

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
      itemType="book"
      labels={{
        info: tDetail("tabInfo"),
        community: tDetail("tabCommunity"),
        log: tDetail("tabLog"),
      }}
      info={
        <CatalogEditor
          itemType="book"
          itemId={book.id}
          item={{
            title: book.title,
            author: book.author,
            synopsis: book.synopsis,
            genres,
            year: book.published_year,
            coverUrl: book.cover_url,
          }}
          editions={editions}
          sagas={sagas.map((s) => ({ sagaId: s.sagaId, name: s.name, isPrimary: s.isPrimary }))}
          canContribute={canContribute}
        >
          {/* Orden del mockup (frame 1): sagas → sinopsis → ficha →
              ediciones, con las ediciones AL FINAL y en tono menor. En PC
              (frame 8) el cuerpo son dos columnas: sagas y ediciones a la
              izquierda, la ficha en la de 340. */}
          <div className="lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-11">
            <div className="flex flex-col gap-10">
              {sagas.length > 0 && (
                <section className="flex flex-col gap-3.5">
                  <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                    {tDetail("sagasCount", { count: sagas.length })}
                  </span>
                  {mainSaga && sagaMembers.length >= 1 && (
                    <div className="lg:hidden">
                      <SagaStrip
                        members={sagaMembers}
                        currentType="book"
                        currentId={book.id}
                        sagaId={mainSaga.sagaId}
                        sagaName={mainSaga.name}
                        positionLabel={sagaPosition(mainSaga)}
                      />
                    </div>
                  )}
                  <SagaList
                    itemType="book"
                    sagas={sagas}
                    positionLabel={sagaPosition}
                  />
                </section>
              )}
              <InfoPanel
                aboutLabel={tDetail("about")}
                synopsis={book.synopsis}
                noSynopsisLabel={tDetail("noSynopsis")}
                actions={<EditFichaButton />}
              />
              {/* La ficha de la obra: en móvil va aquí, entre la sinopsis y
                  las ediciones; en PC se muda a la columna lateral. */}
              <div className="lg:hidden">
                <MetadataSidebar
                  rows={metaRows}
                  genres={genres}
                  genresLabel={tDetail("genres")}
                />
              </div>
              <EditionsSection
                itemType="book"
                itemId={book.id}
                editionsPromise={editionsPromise}
                usedEditionIdsPromise={usedEditionIdsPromise}
                editionsFallback={<EditionsLoading />}
                selectedEditionId={
                  passes.find((p) => !p.finishedOn)?.editionId ?? null
                }
                canContribute={canContribute}
              />
            </div>

            <div className="hidden lg:block">
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
        <CommunityPanel
          itemType="book"
          community={community}
          viewerLoggedIn={Boolean(userId)}
        />
      }
      log={
        <div className="flex flex-col gap-4">
          <LogPanel
            itemType="book"
            itemId={book.id}
            workTotalUnits={book.total_pages}
            entry={entry}
            passes={passes}
            sessions={sessions}
            editions={editions}
            initialClosingPassId={initialClosingPassId}
            canContribute={canContribute}
          />
          {userId && <NotesSection userId={userId} itemType="book" itemId={book.id} />}
        </div>
      }
    />
  );
}
