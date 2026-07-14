import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
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
import { ensureBookEditions } from "@/lib/editions/sync-editions";
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

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tDetail = await getTranslations("detail");
  const tMeta = await getTranslations("detail.meta");
  const tLibrary = await getTranslations("library");
  const supabase = await createClient();

  const [
    { data: book },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("books")
      .select(
        "id, title, author, cover_url, synopsis, published_year, publisher, total_pages, isbn, genres, openlibrary_work_key, editions_synced_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!book) notFound();

  // Créditos (autor): backfill puntual de personas, no una API externa
  // paginada, así que esperarlo no rompe el contrato de "la ficha no bloquea
  // nunca" — y getItemCredits, más abajo, necesita que ya haya escrito.
  await ensureItemEnriched(supabase, "book", {
    id: book.id,
    author: book.author,
  });

  // Ediciones reales de OpenLibrary (Hallazgo 4 de la revisión final): esto
  // SÍ hay que sacarlo del camino bloqueante. La primera visita a un libro
  // sin sincronizar podía tardar hasta 5s en la primera página de
  // editions.json + otros 5s en las páginas 2-5 (en paralelo entre sí) + hasta
  // veinte llamadas a la RPC register_book_edition — todo ANTES de pintar
  // nada, violando el diseño explícito de que esto "no bloquee nunca" la
  // ficha. after() (Next 16) pospone la sincronización a DESPUÉS de enviar la
  // respuesta: la ficha se pinta al instante con las ediciones que YA
  // hubiera: si esta es la primera visita sin sincronizar, esta carga no las
  // ve — se verán en la SIGUIENTE visita. Ese es el precio explícito de no
  // bloquear nunca, no un descuido.
  //
  // Solo con sesión: un visitante anónimo no puede escribir ni las ediciones
  // (la RPC exige auth.uid()) ni la marca de sincronización (el grant es de
  // `authenticated`). Sin este guardia, cada visita anónima a una ficha sin
  // sincronizar programaría en segundo plano hasta cinco llamadas a
  // OpenLibrary y veinte RPC para tirarlo todo a la basura, una y otra vez.
  if (user) {
    after(() =>
      ensureBookEditions(supabase, {
        id: book.id,
        openlibrary_work_key: book.openlibrary_work_key,
        isbn: book.isbn,
        editions_synced_at: book.editions_synced_at,
      })
    );
  }

  const [credits, saga, editions] = await Promise.all([
    getItemCredits(supabase, "book", book.id),
    getItemSaga(supabase, "book", book.id),
    getEditions(supabase, "book", book.id),
  ]);
  // Autores como enlaces a su ficha; si no se pudo enriquecer, texto plano.
  const authorCredits = credits.crew.filter((c) => c.role === "author");

  let entry: ManagedEntry | null = null;
  let sessions: ProgressSession[] = [];
  let passes: Pass[] = [];
  let queues: Queue[] = [];
  if (user) {
    const { data: row } = await supabase
      .from("library_entries")
      .select("id, status, rating, position, notes, queue_id")
      .eq("user_id", user.id)
      .eq("item_type", "book")
      .eq("item_id", book.id)
      .maybeSingle();
    if (row) {
      entry = {
        entryId: row.id,
        status: row.status as MediaStatus,
        rating: row.rating,
        position: parsePosition("book", row.position),
        notes: row.notes,
        queueId: row.queue_id,
      };
      // Las sesiones son del pase ABIERTO, no de toda la entrada (Hallazgo
      // 4): en una relectura, las sesiones de la lectura anterior no deben
      // colarse bajo el cartel de la edición del pase nuevo. Por eso getPasses
      // va primero: getSessions necesita saber cuál es el pase abierto.
      passes = await getPasses(supabase, row.id);
      // El pase abierto si lo hay; si ya terminaste, el último cerrado. Sin ese
      // segundo caso, la lista de sesiones de un libro leído se quedaría vacía
      // para siempre: getPasses ordena el abierto primero y luego los cerrados
      // de más reciente a más antiguo, así que passes[0] es el que toca.
      const currentPassId =
        passes.find((p) => p.finishedOn === null)?.id ?? passes[0]?.id ?? null;
      sessions = await getSessions(supabase, currentPassId, "book");
    }
    queues = await getQueues(supabase, user.id);
  }

  // Asignar saga a mano es contribución curada → colaborador+ (§7.35).
  const canContribute = user
    ? hasMinRole(await getCurrentUserRole(supabase), "collaborator")
    : false;

  const authorNames =
    authorCredits.length > 0
      ? authorCredits.map((a) => a.name)
      : book.author
        ? [book.author]
        : [];

  const byline =
    [
      authorNames.join(", ") || null,
      book.published_year ? String(book.published_year) : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

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
  const community = await getCommunity(supabase, "book", book.id);

  let sagaMembers: SagaMember[] = [];
  if (saga) {
    const full = await getSaga(supabase, saga.sagaId);
    sagaMembers = full?.members ?? [];
  }

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
          entry ? (
            <StatusBadge
              status={entry.status}
              label={tLibrary(`status.${entry.status}`)}
            />
          ) : null
        }
      />

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
                editions={editions}
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
            viewerLoggedIn={Boolean(user)}
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
            />
          </div>
        }
      />
    </div>
  );
}
