import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { genreDefForSlug, labelForSlug } from "@/lib/catalog/genre-vocab";
import { getCatalogByGenre, PAGE_SIZE } from "@/lib/catalog/get-catalog-by-genre";
import { itemHref } from "@/lib/catalog/item-href";
import { CoverCard } from "@/components/ui/cover-card";
import { COVER_GRID_COLS, SHELL_GRID } from "@/lib/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { GenrePager } from "./genre-pager";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Página de un género: lista el catálogo (los tres tipos) que lo lleva. slug
// inválido → 404. Server component puro; el filtro va por la URL (?pagina=N).
export default async function GeneroPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const def = genreDefForSlug(slug);
  const label = labelForSlug(slug);
  if (!def || !label) notFound();

  const sp = await searchParams;
  const rawPage = Array.isArray(sp.pagina) ? sp.pagina[0] : sp.pagina;
  const page = Math.max(1, Number(rawPage) || 1);

  const supabase = await createClient();
  const { items, total } = await getCatalogByGenre(supabase, slug, { page });
  // El mismo clamp que aplica getCatalogByGenre internamente al recortar
  // (misma fórmula, mismo total): así el número que se muestra y los botones
  // prev/next concuerdan con la página que realmente se sirvió.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  return (
    <div className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8`}>
      <PageHeader
        title={label}
        action={
          <span className="font-mono text-[11px] text-muted-foreground">
            {total}
          </span>
        }
      />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay obras de este género.</p>
      ) : (
        <div className={`grid gap-4 ${COVER_GRID_COLS}`}>
          {items.map((item) => (
            <CoverCard
              key={`${item.itemType}:${item.itemId}`}
              href={itemHref(item.itemType, item.itemId)}
              coverUrl={item.coverUrl}
              title={item.title}
              subtitle={item.year ? String(item.year) : undefined}
            />
          ))}
        </div>
      )}

      {total > PAGE_SIZE ? (
        <GenrePager slug={slug} page={currentPage} totalPages={totalPages} />
      ) : null}
    </div>
  );
}
