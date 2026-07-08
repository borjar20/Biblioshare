import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { LibraryItem } from "@/lib/library/types";
import { itemHref } from "@/lib/catalog/item-href";

export async function FavoritesShelf({ items }: { items: LibraryItem[] }) {
  const t = await getTranslations("profile");

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{t("favorites")}</h2>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {items.map((item) => (
          <Link
            key={item.entryId}
            href={itemHref(item.itemType, item.itemId)}
            className="group flex flex-col gap-1"
          >
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-border bg-surface-muted">
              {item.coverUrl ? (
                <Image
                  src={item.coverUrl}
                  alt={item.title}
                  fill
                  sizes="(max-width: 768px) 30vw, 150px"
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                  {item.title}
                </div>
              )}
            </div>
            <span className="line-clamp-1 text-xs font-medium text-foreground">
              {item.title}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
