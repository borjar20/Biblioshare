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

export async function UncollectedShelf({
  userId,
  hideDropped = false,
}: {
  userId: string;
  hideDropped?: boolean;
}) {
  const supabase = await createClient();
  const [{ items, total, hiddenDropped }, t, tLibrary] = await Promise.all([
    getUncollectedItems(supabase, userId, SHELF_LIMIT, hideDropped),
    getTranslations("collection"),
    getTranslations("library"),
  ]);

  if (total === 0) return null;

  // La tira es un recordatorio, no un inventario: el recuento cuenta lo que se
  // ve y el sufijo explica la diferencia. Sin enlace de «Mostrar» a propósito —
  // vive en la pestaña Colecciones, que no tiene barra de filtros donde
  // devolver al usuario.
  const heading = [
    t("uncollected.heading"),
    t("uncollected.count", { count: total }),
    hiddenDropped > 0 ? tLibrary("hiddenDropped", { count: hiddenDropped }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return <FavoritesShelf items={items} variant="compact" heading={heading} />;
}
