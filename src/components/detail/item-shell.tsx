import type { ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { pickPosterArt } from "@/lib/catalog/poster-art";
import { BackButton } from "./back-button";
import { POSTER_AREA, POSTER_BAR, POSTER_GRADIENT, POSTER_LAYOUT } from "./detail-container";
import { ItemHero } from "./item-hero";
import { PosterArtView } from "./poster-art-view";
import { WorkScope } from "./work-scope";

// La ficha como cartel propio de cada obra (spec 2026-11-09): un árbol para móvil
// y PC. Hasta `xl` el cartel abre la página y la cabecera monta sobre su degradado;
// desde `xl` el cartel es una columna fija a la izquierda.
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
  workHue,
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
  /** Tono de la obra, 0–359 (`resolveWorkHue`). */
  workHue: number;
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
    <WorkScope hue={workHue}>
      <div className={POSTER_LAYOUT}>
        <div className={POSTER_AREA}>
          {/* ← · tipo · ⋯ solo en móvil: en PC ya está la topbar del sitio. Antes que el
              cartel en el DOM: el orden de tabulación es volver, menú y zoom. */}
          <div className={POSTER_BAR}>
            <BackButton label={backLabel} />
            <span
              className={`truncate rounded-chip bg-background/85 px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-[0.12em] uppercase backdrop-blur ${MEDIA_ACCENT[itemType].text}`}
            >
              {mediaLabel}
            </span>
            {menuSlot ?? <span aria-hidden className="h-[34px] w-[34px] shrink-0" />}
          </div>
          <PosterArtView art={pickPosterArt({ coverUrl })} title={title} />
          <div aria-hidden className={POSTER_GRADIENT} />
        </div>
        <div className="relative min-w-0">
          <ItemHero
            itemType={itemType}
            mediaLabel={mediaLabel}
            title={title}
            byline={byline}
            genres={genres}
            avgRating={avgRating}
            ratingsLabel={ratingsLabel}
            passCard={passCard}
          />
          {tabs}
        </div>
      </div>
    </WorkScope>
  );
}
