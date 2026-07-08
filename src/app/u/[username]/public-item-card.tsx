import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { LibraryItem } from "@/lib/library/types";
import { itemHref } from "@/lib/catalog/item-href";
import { StatusBadge } from "@/components/ui/status-badge";

export async function PublicItemCard({ item }: { item: LibraryItem }) {
  const t = await getTranslations("library");

  return (
    <div className="flex flex-col gap-2">
      <Link href={itemHref(item.itemType, item.itemId)} className="group flex flex-col gap-2">
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-surface-muted">
          {item.coverUrl ? (
            <Image
              src={item.coverUrl}
              alt={item.title}
              fill
              sizes="(max-width: 768px) 45vw, 200px"
              className="object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
              {item.title}
            </div>
          )}
        </div>

        <span className="line-clamp-2 text-sm font-medium text-foreground">
          {item.title}
        </span>
      </Link>

      <div className="flex flex-col gap-1">
        {item.subtitle && (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {item.subtitle}
          </span>
        )}
        {(item.publisher || item.pageCount) && (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {[item.publisher, item.pageCount ? `${item.pageCount} págs.` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
        <StatusBadge status={item.status} label={t(`status.${item.status}`)} />
      </div>
    </div>
  );
}
