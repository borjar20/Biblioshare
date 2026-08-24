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

  // `total` cuenta solo lo VISIBLE (tras ocultar abandonados). "Nada que
  // enseñar" ya no significa solo "no hay nada suelto": también puede
  // significar "hay algo suelto pero está todo abandonado y oculto" — y ese
  // caso necesita explicación (el rótulo con `hiddenDropped`), no un `return
  // null` silencioso que se traga hasta el sufijo.
  if (total === 0 && hiddenDropped === 0) return null;

  // La tira es un recordatorio, no un inventario: el recuento cuenta lo que se
  // ve y el sufijo explica la diferencia. Sin enlace de «Mostrar» a propósito —
  // vive en la pestaña Colecciones, que no tiene barra de filtros donde
  // devolver al usuario.
  //
  // Con `total === 0` se omite el tramo «0 títulos sin organizar»: no aporta
  // nada y, seguido del aviso de ocultos, leería como una contradicción («0
  // títulos... · 3 abandonados ocultos»). El aviso de ocultos ya explica por
  // qué la tira está aquí sin portadas.
  const heading = [
    t("uncollected.heading"),
    total > 0 ? t("uncollected.count", { count: total }) : null,
    hiddenDropped > 0 ? tLibrary("hiddenDropped", { count: hiddenDropped }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // `FavoritesShelf` pinta `null` si `items` está vacío (es su contrato para
  // el resto de usos, p. ej. Destacados en Mi Biblioteca) — así que con
  // `items.length === 0` (todo lo suelto abandonado y oculto) no basta con
  // pasarle el rótulo: el estante entero desaparecería y el aviso de ocultos
  // nunca llegaría a pintarse. En ese caso concreto se pinta el encabezado
  // directamente, sin reusar el estante (no hay portadas que enseñar).
  if (items.length === 0) {
    return <h2 className="label-section">{heading}</h2>;
  }

  return <FavoritesShelf items={items} variant="compact" heading={heading} />;
}
