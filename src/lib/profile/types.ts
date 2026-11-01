import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import type { LibraryItem } from "@/lib/library/types";

/** Una obra tal como la pinta el perfil: portada y enlace a su ficha. */
export type ProfileCover = {
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  href: string;
};

export function toProfileCover(
  item: Pick<LibraryItem, "itemType" | "itemId" | "title" | "coverUrl">,
): ProfileCover {
  return {
    itemType: item.itemType,
    itemId: item.itemId,
    title: item.title,
    coverUrl: item.coverUrl,
    href: itemHref(item.itemType, item.itemId),
  };
}

export function coverKey(c: Pick<ProfileCover, "itemType" | "itemId">): string {
  return `${c.itemType}:${c.itemId}`;
}
