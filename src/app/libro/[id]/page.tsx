import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  ItemManagePanel,
  type ManagedEntry,
} from "@/components/item-manage-panel";
import { SagaAssignForm } from "@/components/saga-assign-form";
import { ItemHero } from "@/components/detail/item-hero";
import { ItemDetailTabs } from "@/components/detail/item-detail-tabs";
import { InfoPanel } from "@/components/detail/info-panel";
import {
  MetadataSidebar,
  type MetaRow,
} from "@/components/detail/metadata-sidebar";
import { CommunityPanel } from "@/components/detail/community-panel";
import { SagaStrip } from "@/components/detail/saga-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getMockCommunity } from "@/lib/catalog/mock-community";
import { ensureItemEnriched } from "@/lib/people/enrich-item";
import { getItemCredits } from "@/lib/people/get-item-credits";
import { getItemSaga } from "@/lib/sagas/get-item-saga";
import { getSaga } from "@/lib/sagas/get-saga";
import type { SagaMember } from "@/lib/sagas/types";
import { parsePosition } from "@/lib/library/position";
import { getSessions } from "@/lib/sessions/get-sessions";
import type { ProgressSession } from "@/lib/sessions/types";
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
  const t = await getTranslations("item");
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
        "id, title, author, cover_url, synopsis, published_year, publisher, total_pages, isbn, genres",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!book) notFound();

  await ensureItemEnriched(supabase, "book", {
    id: book.id,
    author: book.author,
  });

  const [credits, saga] = await Promise.all([
    getItemCredits(supabase, "book", book.id),
    getItemSaga(supabase, "book", book.id),
  ]);
  // Autores como enlaces a su ficha; si no se pudo enriquecer, texto plano.
  const authorCredits = credits.crew.filter((c) => c.role === "author");

  let entry: ManagedEntry | null = null;
  let sessions: ProgressSession[] = [];
  if (user) {
    const { data: row } = await supabase
      .from("library_entries")
      .select("id, status, rating, position, notes")
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
      };
      sessions = await getSessions(supabase, row.id, "book");
    }
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

  const metaRows: MetaRow[] = [];
  if (authorNames.length > 0)
    metaRows.push({ label: tMeta("author"), value: authorNames.join(", ") });
  if (book.publisher)
    metaRows.push({ label: tMeta("publisher"), value: book.publisher });
  if (book.published_year)
    metaRows.push({
      label: tMeta("published"),
      value: String(book.published_year),
    });
  if (book.total_pages)
    metaRows.push({
      label: tMeta("pages"),
      value: `${book.total_pages} ${t("pages")}`,
    });
  if (book.isbn) metaRows.push({ label: tMeta("isbn"), value: book.isbn });

  const genres = book.genres ?? [];
  const community = getMockCommunity(book.id);

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
          <InfoPanel
            aboutLabel={tDetail("about")}
            synopsis={book.synopsis}
            noSynopsisLabel={tDetail("noSynopsis")}
            sidebar={
              <MetadataSidebar
                rows={metaRows}
                genres={genres}
                genresLabel={tDetail("genres")}
              />
            }
          />
        }
        community={
          <div className="flex flex-col gap-10">
            {saga && sagaMembers.length >= 2 && (
              <SagaStrip
                members={sagaMembers}
                currentType="book"
                currentId={book.id}
                sagaName={saga.name}
                label={tDetail("saga")}
              />
            )}
            <CommunityPanel itemType="book" community={community} />
          </div>
        }
        log={
          <div className="flex flex-col gap-4">
            <ItemManagePanel
              itemType="book"
              itemId={book.id}
              entry={entry}
              sessions={sessions}
            />
            {canContribute && (
              <SagaAssignForm
                itemType="book"
                itemId={book.id}
                currentSaga={saga ? { id: saga.sagaId, name: saga.name } : null}
              />
            )}
          </div>
        }
      />
    </div>
  );
}
