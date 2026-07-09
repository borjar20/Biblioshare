import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  ItemManagePanel,
  type ManagedEntry,
} from "@/components/item-manage-panel";
import { SagaAssignForm } from "@/components/saga-assign-form";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { personHref, sagaHref } from "@/lib/catalog/item-href";
import { ensureItemEnriched } from "@/lib/people/enrich-item";
import { getItemCredits } from "@/lib/people/get-item-credits";
import { getItemSaga } from "@/lib/sagas/get-item-saga";
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

  // El autor se muestra como enlace(s) a su ficha (abajo); aquí quedan el resto
  // de metadatos de la obra.
  const metaLines = [
    book.published_year ? String(book.published_year) : null,
    [
      book.publisher,
      book.total_pages ? `${book.total_pages} ${t("pages")}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    book.isbn ? `ISBN ${book.isbn}` : null,
    book.genres && book.genres.length > 0 ? book.genres.join(", ") : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-start sm:px-6">
      <div className="relative aspect-[2/3] w-full max-w-xs shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted sm:w-56">
        {book.cover_url ? (
          <Image
            src={book.cover_url}
            alt={book.title}
            fill
            sizes="(max-width: 768px) 80vw, 224px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
            {book.title}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{book.title}</h1>

        {authorCredits.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {authorCredits.map((author, i) => (
              <span key={author.id}>
                {i > 0 && ", "}
                <Link
                  href={personHref(author.id)}
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  {author.name}
                </Link>
              </span>
            ))}
          </p>
        ) : (
          book.author && (
            <p className="text-sm text-muted-foreground">{book.author}</p>
          )
        )}

        {metaLines.map((line, i) => (
          <p key={i} className="text-sm text-muted-foreground">
            {line}
          </p>
        ))}

        {saga && (
          <Link
            href={sagaHref(saga.sagaId)}
            className="inline-flex w-fit items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-muted"
          >
            {saga.position
              ? t("sagaPart", { name: saga.name, number: saga.position })
              : t("sagaLabel", { name: saga.name })}
          </Link>
        )}

        {book.synopsis && (
          <p className="text-sm text-foreground">{book.synopsis}</p>
        )}

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
    </div>
  );
}
