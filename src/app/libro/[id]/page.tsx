import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ItemLibraryButton } from "@/components/item-library-button";

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

  const [{ data: book }, { data: { user } }] = await Promise.all([
    supabase
      .from("books")
      .select(
        "id, title, author, cover_url, synopsis, published_year, publisher, total_pages, isbn, genres"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!book) notFound();

  let alreadyAdded = false;
  if (user) {
    const { data: entry } = await supabase
      .from("library_entries")
      .select("id")
      .eq("user_id", user.id)
      .eq("item_type", "book")
      .eq("item_id", book.id)
      .maybeSingle();
    alreadyAdded = entry !== null;
  }

  const metaLines = [
    [book.author, book.published_year].filter(Boolean).join(" · "),
    [book.publisher, book.total_pages ? `${book.total_pages} ${t("pages")}` : null]
      .filter(Boolean)
      .join(" · "),
    book.isbn ? `ISBN ${book.isbn}` : null,
    book.genres && book.genres.length > 0 ? book.genres.join(", ") : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:flex-row sm:px-6">
      <div className="relative aspect-[2/3] w-full max-w-xs shrink-0 overflow-hidden rounded-lg bg-surface-muted sm:w-56">
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

        {metaLines.map((line, i) => (
          <p key={i} className="text-sm text-muted-foreground">
            {line}
          </p>
        ))}

        {book.synopsis && (
          <p className="text-sm text-foreground">{book.synopsis}</p>
        )}

        <div>
          <ItemLibraryButton
            itemType="book"
            itemId={book.id}
            initiallyAdded={alreadyAdded}
          />
        </div>
      </div>
    </div>
  );
}
