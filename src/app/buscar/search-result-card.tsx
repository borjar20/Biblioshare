import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { SearchResult } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";

export async function SearchResultCard({ result }: { result: SearchResult }) {
  const href = itemHref(result.itemType, result.catalogId ?? result.externalId);
  const t = await getTranslations("search");
  const editionCount = result.editionCount ?? 1;

  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-lg transition hover:-translate-y-0.5"
    >
      <div className="relative aspect-2/3 w-full overflow-hidden rounded-lg border border-border bg-surface-muted">
        {result.coverUrl ? (
          <Image
            src={result.coverUrl}
            alt={result.title}
            fill
            sizes="(max-width: 768px) 45vw, 200px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
            {result.title}
          </div>
        )}
        {editionCount > 1 && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-surface/90 px-2 py-0.5 font-mono text-[10px] font-medium text-foreground backdrop-blur">
            {t("editions", { count: editionCount })}
          </span>
        )}
      </div>
      <div className="flex flex-col">
        <span className="line-clamp-2 text-sm font-medium text-foreground">
          {result.title}
        </span>
        {(result.subtitle || result.year) && (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {[result.subtitle, result.year].filter(Boolean).join(" · ")}
          </span>
        )}
        {(result.publisher || result.pageCount) && (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {[
              result.publisher,
              result.pageCount ? `${result.pageCount} págs.` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
    </Link>
  );
}
