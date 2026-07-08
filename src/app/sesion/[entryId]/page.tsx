import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import { parsePosition } from "@/lib/library/position";
import type { MediaStatus } from "@/lib/library/types";
import { SessionForm } from "./session-form";

export const metadata: Metadata = {
  title: "Guardar sesión — Biblioshare",
};

export default async function SessionPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const t = await getTranslations("session");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entry } = await supabase
    .from("library_entries")
    .select("id, item_type, item_id, status, position")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!entry) notFound();

  // Sessions only make sense for books and series (§7.14 scope). A movie
  // entry has no incremental progress — send it back to its detail page.
  if (entry.item_type === "movie") {
    redirect(itemHref("movie", entry.item_id));
  }

  const itemType = entry.item_type as "book" | "series";

  const [{ data: book }, { data: series }] = await Promise.all([
    itemType === "book"
      ? supabase
          .from("books")
          .select("title, author, cover_url, total_pages")
          .eq("id", entry.item_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    itemType === "series"
      ? supabase
          .from("series")
          .select("title, cover_url, total_episodes")
          .eq("id", entry.item_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const title = book?.title ?? series?.title ?? "";
  const coverUrl = book?.cover_url ?? series?.cover_url ?? null;
  const total = book?.total_pages ?? series?.total_episodes ?? null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center gap-4">
        <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-surface-muted">
          {coverUrl && (
            <Image src={coverUrl} alt={title} fill sizes="64px" className="object-cover" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {itemType === "book" ? t("titleBook") : t("titleSeries")}
          </h1>
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
      </div>

      <SessionForm
        entryId={entry.id}
        itemType={itemType}
        itemId={entry.item_id}
        position={parsePosition(itemType, entry.position)}
        status={entry.status as MediaStatus}
        total={total}
      />
    </div>
  );
}
