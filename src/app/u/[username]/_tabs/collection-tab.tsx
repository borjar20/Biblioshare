import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { LibraryItemCard } from "@/components/library/library-item-card";
import { FavoritesShelf } from "@/components/favorites-shelf";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxIcon } from "@/components/ui/icons";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort } from "@/lib/library/types";

const TYPES: ItemType[] = ["book", "movie", "series"];

// Píldora de tipo del frame E/I: punto de color del tipo + etiqueta; la activa
// se rellena de accent. Solo filtra por tipo — el visitante no tiene búsqueda,
// estado ni orden (plan 05, tarea 1.3).
function TypePill({
  href,
  active,
  dotColorVar,
  label,
}: {
  href: string;
  active: boolean;
  dotColorVar?: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-surface text-muted-foreground hover:text-foreground"
      }`}
    >
      {dotColorVar && (
        <span
          aria-hidden
          className="h-[7px] w-[7px] rounded-full"
          style={{ background: active ? "currentColor" : `var(${dotColorVar})` }}
        />
      )}
      {label}
    </Link>
  );
}

// Colección — solo la ve un visitante (frames E/I): destacados arriba (su carta
// de presentación), píldoras de tipo y grid con estado. El dueño no tiene esta
// pestaña: su biblioteca es /coleccion (plan 05, P2).
export async function CollectionTab({
  userId,
  basePath,
  itemType,
}: {
  userId: string;
  basePath: string;
  itemType?: ItemType;
}) {
  const t = await getTranslations("profile");
  const tLibrary = await getTranslations("library");
  const tSearch = await getTranslations("search");
  const supabase = await createClient();

  // Recientes primero, como el resto del producto; el visitante no reordena.
  const sort: LibrarySort = "recent";
  const [items, favorites] = await Promise.all([
    getLibraryItems(supabase, userId, { itemType, sort }),
    // Destacados de toda la biblioteca, no del tipo filtrado: son la portada
    // del perfil, no parte de la rejilla.
    itemType
      ? Promise.resolve([])
      : getLibraryItems(supabase, userId, { favoritesOnly: true }),
  ]);

  function typeHref(next?: ItemType): string {
    const params = new URLSearchParams({ tab: "coleccion" });
    if (next) params.set("type", next);
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-5">
      {!itemType && <FavoritesShelf items={favorites} variant="compact" />}

      <div className="flex flex-wrap gap-1.5">
        <TypePill
          href={typeHref(undefined)}
          active={!itemType}
          label={tLibrary("filters.allTypes")}
        />
        {TYPES.map((type) => (
          <TypePill
            key={type}
            href={typeHref(type)}
            active={itemType === type}
            dotColorVar={MEDIA_ACCENT[type].varName}
            label={tSearch(`types.${type}`)}
          />
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          glyph={<InboxIcon className="h-7 w-7" />}
          title={t("emptyTitle")}
          message={t("empty")}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="label-section">
            {tLibrary("titlesCount", { count: items.length })}
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {items.map((item) => (
              <LibraryItemCard key={item.entryId} item={item} isOwner={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
