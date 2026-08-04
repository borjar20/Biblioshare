import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { LibraryItem } from "@/lib/library/types";
import { itemHref } from "@/lib/catalog/item-href";

// Dos looks del mismo estante:
//  · "titled" (por defecto) — el de /coleccion: 3/6 columnas con título debajo.
//  · "compact" — la carta de presentación del visitante (frame E/I): una fila
//    de portadas sin título, 6 en móvil y 8 en escritorio.
export async function FavoritesShelf({
  items,
  variant = "titled",
}: {
  items: LibraryItem[];
  variant?: "titled" | "compact";
}) {
  const t = await getTranslations("profile");

  if (items.length === 0) return null;

  const compact = variant === "compact";

  return (
    <div className="flex flex-col gap-3">
      <h2 className="label-section">
        {t("highlights")}
      </h2>
      <div
        className={
          compact
            ? "grid grid-cols-6 gap-2 lg:grid-cols-8"
            : "grid grid-cols-3 gap-3 sm:grid-cols-6"
        }
      >
        {items.map((item) => (
          <Link
            key={item.entryId}
            href={itemHref(item.itemType, item.itemId)}
            className="group flex flex-col gap-1"
          >
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-cover border border-border bg-surface-muted shadow-cover">
              {item.coverUrl ? (
                <Image
                  src={item.coverUrl}
                  alt={item.title}
                  fill
                  sizes={compact ? "(max-width: 768px) 15vw, 110px" : "(max-width: 768px) 30vw, 150px"}
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                  {item.title}
                </div>
              )}
            </div>
            {!compact && (
              <span className="line-clamp-1 text-xs font-medium text-foreground">
                {item.title}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
