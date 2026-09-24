import type { ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { ItemHero } from "./item-hero";

// La ficha: hero cinemático + pestañas (spec 2026-09-23-ficha-cinematica-design.md).
//
// Hasta el 2026-09 eran DOS árboles —hero de móvil y raíl de 300px + cabecera
// de PC— escondidos por breakpoint, dentro de un contenedor de 1200px: el cuerpo
// de cualquier pestaña se quedaba en ~771px a cualquier viewport (plan 06 §6e).
// Ahora es un árbol: el ancho lo fija DETAIL_CONTAINER, compartido con las
// pestañas.
//
// Las pestañas siguen llegando como slot y se pintan UNA vez, así que el
// <Suspense> que las envuelve (Fase B del plan 00) sigue intacto.
export function ItemShell({
  itemType,
  mediaLabel,
  title,
  byline,
  genres,
  coverUrl,
  backdropUrl,
  avgRating,
  ratingsLabel,
  backLabel,
  menuSlot,
  passCard,
  tabs,
}: {
  itemType: ItemType;
  mediaLabel: string;
  title: string;
  byline: string | null;
  genres: string[];
  coverUrl: string | null;
  /** Backdrop de TMDB (PR 1); null en libros y en obras sin él. */
  backdropUrl: string | null;
  avgRating: number | null;
  ratingsLabel: string;
  backLabel: string;
  /** El menú ⋯ de la barra superior — solo móvil. */
  menuSlot?: ReactNode;
  /** <PassCard/>, una sola instancia. */
  passCard: ReactNode;
  tabs: ReactNode;
}) {
  return (
    <div className="w-full">
      <ItemHero
        itemType={itemType}
        mediaLabel={mediaLabel}
        title={title}
        byline={byline}
        genres={genres}
        coverUrl={coverUrl}
        backdropUrl={backdropUrl}
        avgRating={avgRating}
        ratingsLabel={ratingsLabel}
        backLabel={backLabel}
        menuSlot={menuSlot}
        passCard={passCard}
      />
      {tabs}
    </div>
  );
}
