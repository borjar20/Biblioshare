import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getUncollectedItems } from "@/lib/library/collections";
import { FavoritesShelf } from "@/components/favorites-shelf";

// Tira «Sin colección»: lo que está en la biblioteca y en ninguna colección,
// al pie de la pestaña. Es un recordatorio, no un inventario — enseña un
// puñado de portadas y dice cuántas hay en total.
//
// Se apoya en `FavoritesShelf` (variante compacta) en vez de repetir el
// marcado de portadas; lo único suyo es el rótulo. Si no hay nada suelto —o el
// usuario no tiene ninguna colección todavía— no pinta nada.
const SHELF_LIMIT = 12;

export async function UncollectedShelf({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [{ items, total }, t] = await Promise.all([
    getUncollectedItems(supabase, userId, SHELF_LIMIT),
    getTranslations("collection"),
  ]);

  if (total === 0) return null;

  return (
    <FavoritesShelf
      items={items}
      variant="compact"
      heading={`${t("uncollected.heading")} · ${t("uncollected.count", { count: total })}`}
    />
  );
}
