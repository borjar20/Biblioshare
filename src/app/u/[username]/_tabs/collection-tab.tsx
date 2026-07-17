import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { LibraryFilters } from "@/components/library/library-filters";
import { LibraryItemCard } from "@/components/library/library-item-card";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxIcon } from "@/components/ui/icons";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort, MediaStatus } from "@/lib/library/types";

// Colección — solo la ve un visitante (frames E/I). El dueño no tiene esta
// pestaña: su biblioteca es /coleccion (plan 05, P2).
export async function CollectionTab({
  userId,
  basePath,
  itemType,
  status,
  search,
  sort,
}: {
  userId: string;
  basePath: string;
  itemType?: ItemType;
  status?: MediaStatus;
  search?: string;
  sort: LibrarySort;
}) {
  const t = await getTranslations("profile");
  const supabase = await createClient();
  const items = await getLibraryItems(supabase, userId, {
    itemType,
    status,
    search,
    sort,
  });

  return (
    <>
      <LibraryFilters
        itemType={itemType}
        status={status}
        search={search}
        sort={sort}
        basePath={basePath}
        extraParams={{ tab: "coleccion" }}
      />

      {items.length === 0 ? (
        <EmptyState
          glyph={<InboxIcon className="h-7 w-7" />}
          title={t("emptyTitle")}
          message={t("empty")}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <LibraryItemCard key={item.entryId} item={item} isOwner={false} />
          ))}
        </div>
      )}
    </>
  );
}
