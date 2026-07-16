import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ItemTabsSkeleton } from "@/components/detail/item-tabs-skeleton";
import { getQueues } from "@/lib/queue/get-queues";
import type { Queue } from "@/lib/queue/types";
import {
  LogPanel,
  type ManagedEntry,
} from "@/components/detail/log-panel";
import { CatalogEditor, EditFichaButton } from "@/components/detail/catalog-editor";
import { ItemHero } from "@/components/detail/item-hero";
import { ItemDetailTabs } from "@/components/detail/item-detail-tabs";
import { InfoPanel } from "@/components/detail/info-panel";
import { type MetaRow } from "@/components/detail/metadata-sidebar";
import { CommunityPanel } from "@/components/detail/community-panel";
import { SagaStrip } from "@/components/detail/saga-strip";
import { EditionsSection } from "@/components/detail/edition-details";
import { StatusBadge } from "@/components/ui/status-badge";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getCommunity } from "@/lib/community/get-community";
import { getEditions } from "@/lib/editions/get-editions";
import { loadBookEditions } from "@/lib/editions/load-editions";
import { EditionsLoading } from "@/components/detail/editions-loading";
import { ensureBookHydrated } from "@/lib/catalog/hydrate-book";
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
type Community = Awaited<ReturnType<typeof getCommunity>>;

export default async function BookDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cerrar?: string }>;
}) {
  const { id } = await params;
  const { cerrar } = await searchParams;
  const tDetail = await getTranslations("detail");
  const tLibrary = await getTranslations("library");
  const supabase = await createClient();

  const [
    { data: book },
    {
      data: { user },
    },
  ] = await Promise.all([fetchBook(supabase, id), supabase.auth.getUser()]);

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
      })
    );
  }

  // Lo mínimo para pintar el hero: la nota media de la comunidad y el estado
  // del pase activo. Todo lo demás (créditos, saga, ediciones, pases, sesiones,
  // colas) vive en las pestañas y llega por streaming — Fase B del plan de
  // navegación: la primera visita ya no espera al backfill ni a las ediciones.
  const [community, activeStatus] = await Promise.all([
    getCommunity(supabase, "book", book.id),
    user
      ? supabase
          .from("passes")
          .select("status")
          .eq("user_id", user.id)
          .eq("item_type", "book")
          .eq("item_id", book.id)
          .eq("is_active", true)
          .maybeSingle()
          .then(({ data }) => (data?.status as MediaStatus | undefined) ?? null)
      : Promise.resolve(null),
  ]);

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

  return (
    <div className="flex flex-col">
      <ItemHero
        itemType="book"
        mediaLabel={tDetail("mediaLabel.book")}
        title={book.title}
        byline={byline}
        genres={genres}
        coverUrl={book.cover_url}
        avgRating={community.avgRating}
        ratingCount={community.ratingCount}
        ratingsLabel={tDetail("ratings")}
        backLabel={tDetail("back")}
        statusSlot={
          activeStatus ? (
            <StatusBadge
              status={activeStatus}
              label={tLibrary(`status.${activeStatus}`)}
            />
          ) : null
        }
      />

      <Suspense fallback={<ItemTabsSkeleton />}>
        <BookTabs
          book={book}
          userId={user?.id ?? null}
          community={community}
          cerrar={cerrar}
        />
      </Suspense>
    </div>
  );
}

// Las pestañas: aquí vive todo lo pesado (backfill de personas, créditos, saga,
// ediciones, pases, sesiones y colas), detrás del <Suspense> del hero.
async function BookTabs({
  book,
  userId,
  community,
  cerrar,
}: {
  book: BookRow;
  userId: string | null;
  community: Community;
  cerrar?: string;
}) {
  const supabase = await createClient();
  const tDetail = await getTranslations("detail");
  const tMeta = await getTranslations("detail.meta");

  // Créditos (autor): backfill puntual de personas, no una API externa
  // paginada — y getItemCredits, más abajo, necesita que ya haya escrito.
  await ensureItemEnriched(supabase, "book", {
    id: book.id,
    author: book.author,
  });

  const [credits, saga, editions] = await Promise.all([
    getItemCredits(supabase, "book", book.id),
    getItemSaga(supabase, "book", book.id),
    getEditions(supabase, "book", book.id),
  ]);

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
  let queues: Queue[] = [];
  if (userId) {
    // "En mi biblioteca" = existe pase ACTIVO de la obra (§Tarea 9, hub):
    // status/rating/position/queue_id viven en diary_entries, library_entries
    // ya no se lee. La nota (notes) sale de pass_reviews (privacidad ya
    // aplicada) — ningún consumidor de ManagedEntry la renderiza hoy, pero se
    // resuelve igualmente para no dejar el campo con un dato inventado.
    const { data: row } = await supabase
      .from("passes")
      .select("id, status, rating, position, queue_id")
      .eq("user_id", userId)
      .eq("item_type", "book")
      .eq("item_id", book.id)
      .eq("is_active", true)
      .maybeSingle();
    if (row) {
      const { data: reviewRow } = await supabase
        .from("pass_reviews")
        .select("review")
        .eq("id", row.id)
        .maybeSingle();
      entry = {
        entryId: row.id,
        status: row.status as MediaStatus,
        rating: row.rating,
        position: parsePosition("book", row.position),
        notes: reviewRow?.review ?? null,
        queueId: row.queue_id,
      };
      // Las sesiones son del pase ABIERTO, no de toda la entrada (Hallazgo
      // 4): en una relectura, las sesiones de la lectura anterior no deben
      // colarse bajo el cartel de la edición del pase nuevo. Por eso getPasses
      // va primero: getSessions necesita saber cuál es el pase abierto.
      passes = await getPasses(supabase, "book", book.id, userId);
      // El pase abierto si lo hay; si ya terminaste, el último cerrado. Sin ese
      // segundo caso, la lista de sesiones de un libro leído se quedaría vacía
      // para siempre: getPasses ordena el abierto primero y luego los cerrados
      // de más reciente a más antiguo, así que passes[0] es el que toca.
      const currentPassId =
        passes.find((p) => p.finishedOn === null)?.id ?? passes[0]?.id ?? null;
      sessions = await getSessions(supabase, currentPassId, "book");
    }
    queues = await getQueues(supabase, userId);
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

  // Asignar saga a mano es contribución curada → colaborador+ (§7.35).
  const canContribute = userId
    ? hasMinRole(await getCurrentUserRole(supabase), "collaborator")
    : false;

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
  if (authorNames.length > 0)
    metaRows.push({ label: tMeta("author"), value: authorNames.join(", ") });
  if (book.published_year)
    metaRows.push({
      label: tMeta("firstPublished"),
      value: String(book.published_year),
    });

  const genres = book.genres ?? [];

  let sagaMembers: SagaMember[] = [];
  if (saga) {
    const full = await getSaga(supabase, saga.sagaId);
    sagaMembers = full?.members ?? [];
  }

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
            saga={saga ? { id: saga.sagaId, name: saga.name } : null}
            canContribute={canContribute}
          >
            <div className="flex flex-col gap-10">
              {saga && sagaMembers.length >= 1 && (
                <SagaStrip
                  members={sagaMembers}
                  currentType="book"
                  currentId={book.id}
                  sagaId={saga.sagaId}
                  sagaName={saga.name}
                  label={tDetail("saga")}
                />
              )}
              {/* La sinopsis va DENTRO de EditionsSection: el mockup la pone
                  entre la tira de ediciones y el panel de metadatos, y así los
                  dos comparten el estado de "qué edición miro". */}
              <EditionsSection
                itemType="book"
                itemId={book.id}
                editionsPromise={editionsPromise}
                editionsFallback={<EditionsLoading />}
                selectedEditionId={passes.find((p) => !p.finishedOn)?.editionId ?? null}
                canContribute={canContribute}
                workRows={metaRows}
                genres={genres}
                genresLabel={tDetail("genres")}
              >
                <InfoPanel
                  aboutLabel={tDetail("about")}
                  synopsis={book.synopsis}
                  noSynopsisLabel={tDetail("noSynopsis")}
                  actions={<EditFichaButton />}
                />
              </EditionsSection>
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
              entry={entry}
              passes={passes}
              sessions={sessions}
              editions={editions}
              queues={queues}
              initialClosingPassId={initialClosingPassId}
            />
          </div>
        }
      />
  );
}
