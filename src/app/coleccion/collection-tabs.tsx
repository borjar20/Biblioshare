import Link from "next/link";
import { getTranslations } from "next-intl/server";

// Subpestañas VISIBLES de Mi Biblioteca (Colección v2, sesión 1; «Sagas»
// añadida en F5 Task 4). Las píldoras por tipo (antes Libros/Películas/Series)
// se retiran de aquí: ese filtrado vive ahora dentro de `Todo` (Sesión 2,
// `LibraryFilters` con `showTypeFilter`).
//
// `colas` desaparece del todo (2026-07-20): llevaba desde la integración de v2
// sin pintarse aquí y sin que ningún enlace llevara a `?tab=colas`. `KnownTab`
// se queda como alias de `CollectionTab` — ya no hay rutas vivas que no sean
// subpestañas — para no tocar las firmas de `page.tsx` en el mismo cambio.
export type CollectionTab = "colecciones" | "todo" | "sagas";
export type KnownTab = CollectionTab;

export const COLLECTION_TABS: CollectionTab[] = [
  "colecciones",
  "sagas",
  "todo",
];

export const KNOWN_TABS: KnownTab[] = [...COLLECTION_TABS];

export async function CollectionTabs({ active }: { active: KnownTab }) {
  const t = await getTranslations("collection.tabs");

  return (
    // Sin `overflow-x-auto`: con solo dos subpestañas siempre caben, y ese
    // overflow forzaba también `overflow-y:auto` (regla del spec), que sacaba
    // una barra de scroll fantasma al desbordar el borde inferior 1px.
    <div className="flex gap-6 border-b border-border">
      {COLLECTION_TABS.map((tab) => {
        const href =
          tab === "colecciones" ? "/coleccion" : `/coleccion?tab=${tab}`;
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={href}
            className={`-mb-px shrink-0 border-b-2 px-1 pt-2 pb-3 font-serif text-[15.5px] font-semibold transition-colors ${
              isActive
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(tab)}
          </Link>
        );
      })}
    </div>
  );
}
