import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { parsePosition } from "@/lib/library/position";
import type { MediaStatus } from "@/lib/library/types";
import { getPasses } from "@/lib/passes/get-passes";
import { getEditions } from "@/lib/editions/get-editions";
import { primaryEdition } from "@/lib/editions/edition-label";
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
  const tDetail = await getTranslations("detail");
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

  const [{ data: book }, { data: series }, passes] = await Promise.all([
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
          .select("title, creator, cover_url, total_episodes")
          .eq("id", entry.item_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    getPasses(supabase, entry.id),
  ]);

  const title = book?.title ?? series?.title ?? "";
  const coverUrl = book?.cover_url ?? series?.cover_url ?? null;
  const author = book?.author ?? series?.creator ?? null;

  // El total contra el que se mide el progreso sale de la EDICIÓN del pase
  // abierto (o de la primaria si el pase no tiene ninguna asignada), no de
  // books.total_pages: la de bolsillo y la de tapa dura no tienen las mismas
  // páginas, así que "voy por la 240" solo es cierto contra tu edición. Las
  // series no tienen ediciones (getEditions devuelve []), así que caen al
  // total de episodios del catálogo.
  const openPass = passes.find((p) => !p.finishedOn) ?? null;
  const editions = await getEditions(supabase, itemType, entry.item_id);
  const edition =
    editions.find((e) => e.id === openPass?.editionId) ?? primaryEdition(editions);
  const total = edition?.totalUnits ?? book?.total_pages ?? series?.total_episodes ?? null;

  const accent = MEDIA_ACCENT[itemType];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">
        {itemType === "book" ? t("titleBook") : t("titleSeries")}
      </h1>

      {/* Tarjeta de contexto del ítem (mockup "Paper - Registrar sesión",
          pantallas 1-3): recuerda qué estás registrando sin tener que volver
          atrás — el gesto se repite tanto que no puede obligar a pensar. */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
        <div className="relative h-[60px] w-10 shrink-0 overflow-hidden rounded-md bg-surface-muted">
          {coverUrl && (
            <Image src={coverUrl} alt={title} fill sizes="40px" className="object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[14.5px] font-semibold text-foreground">
            {title}
          </p>
          {author && (
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
              {author}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-1 font-mono text-[9px] font-medium tracking-wider uppercase ${accent.bgSoft} ${accent.text}`}
        >
          {tDetail(`mediaLabel.${itemType}`)}
        </span>
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
