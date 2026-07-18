import Link from "next/link";
import { getTranslations } from "next-intl/server";

// Subpestañas VISIBLES de Mi Biblioteca (Colección v2, sesión 1). Las píldoras
// por tipo (antes Libros/Películas/Series) se retiran de aquí: ese filtrado
// vive ahora dentro de `Todo` (Sesión 2, `LibraryFilters` con
// `showTypeFilter`). `colas` ya no es una subpestaña, pero la ruta
// `?tab=colas` sigue viva (ver `KNOWN_TABS`) — `page.tsx` la resuelve aunque
// no se pinte aquí.
export type CollectionTab = "colecciones" | "todo";
export type KnownTab = CollectionTab | "colas";

export const COLLECTION_TABS: CollectionTab[] = ["colecciones", "todo"];
export const KNOWN_TABS: KnownTab[] = ["colecciones", "todo", "colas"];

export async function CollectionTabs({ active }: { active: KnownTab }) {
  const t = await getTranslations("collection.tabs");

  return (
    <div className="flex gap-6 overflow-x-auto border-b border-border">
      {COLLECTION_TABS.map((tab) => {
        const href = tab === "colecciones" ? "/coleccion" : `/coleccion?tab=${tab}`;
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
