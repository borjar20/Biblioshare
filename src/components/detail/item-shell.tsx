import type { ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { ItemHero } from "./item-hero";
import { ItemRail } from "./item-rail";
import { ItemHeaderWide } from "./item-header-wide";

// La ficha entera son DOS pantallas, no una responsive (plan 06 §2bis):
//
// - Móvil (frames 1-7): hero con portada, barra superior y píldora de estado,
//   y debajo las pestañas a lo ancho.
// - PC (frames 8-12): rail sticky de 300px con la portada y el panel de
//   control, y una columna a la derecha con cabecera, pestañas y cuerpo.
//
// Por eso hay dos árboles y no un hero que se estira: en PC no existen el
// botón de volver, el label de tipo centrado ni la píldora de estado, la
// portada cambia de sitio, y el byline pasa de mono 11 a serif 22. Cada uno se
// esconde en su breakpoint. El precio es que la portada se pinta dos veces
// (una oculta): son ~15 KB y a cambio no hay que reordenar el DOM con trucos.
//
// Las pestañas se pasan como slot y se pintan UNA vez: en PC caen dentro de la
// columna derecha; en móvil, a lo ancho. Así el <Suspense> que las envuelve
// (Fase B del plan 00) sigue intacto.
export function ItemShell({
  itemType,
  mediaLabel,
  title,
  byline,
  genres,
  coverUrl,
  avgRating,
  ratingsLabel,
  backLabel,
  statusSlot,
  menuSlot,
  railActions,
  tabs,
}: {
  itemType: ItemType;
  mediaLabel: string;
  title: string;
  byline: string | null;
  genres: string[];
  coverUrl: string | null;
  avgRating: number | null;
  ratingsLabel: string;
  backLabel: string;
  /** La píldora "En tu biblioteca · Leyendo" — solo móvil. */
  statusSlot?: ReactNode;
  /** El menú ⋯ de la barra del hero (P2) — solo móvil, como la barra. */
  menuSlot?: ReactNode;
  /** Panel de control del rail — solo PC. */
  railActions?: ReactNode;
  tabs: ReactNode;
}) {
  return (
    <div className="mx-auto w-full lg:grid lg:max-w-[1160px] lg:grid-cols-[300px_1fr]">
      <div className="hidden lg:block">
        <ItemRail
          itemType={itemType}
          title={title}
          coverUrl={coverUrl}
          actions={railActions}
        />
      </div>

      <div className="min-w-0 lg:border-l lg:border-border">
        <div className="lg:hidden">
          <ItemHero
            itemType={itemType}
            mediaLabel={mediaLabel}
            title={title}
            byline={byline}
            genres={genres}
            coverUrl={coverUrl}
            avgRating={avgRating}
            ratingsLabel={ratingsLabel}
            backLabel={backLabel}
            statusSlot={statusSlot}
            menuSlot={menuSlot}
          />
        </div>

        <div className="hidden lg:block">
          <ItemHeaderWide
            itemType={itemType}
            mediaLabel={mediaLabel}
            title={title}
            byline={byline}
            avgRating={avgRating}
            ratingsLabel={ratingsLabel}
          />
        </div>

        {tabs}
      </div>
    </div>
  );
}
