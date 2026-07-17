import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { BookIcon, FilmIcon, SeriesIcon } from "@/components/ui/icons";

const TYPE_ICON = {
  book: BookIcon,
  movie: FilmIcon,
  series: SeriesIcon,
} as const;

// La cabecera de la columna derecha en PC (.desk-header de los frames 8-12).
// NO es el hero móvil ensanchado: aquí no hay botón de volver, ni label de
// tipo centrado, ni píldora "En tu biblioteca ·" — el estado es un control del
// rail.
//
// El frame 8 alarga esta cabecera con la sinopsis, los géneros y los datos,
// pero solo en Info — y aquí no sabemos qué pestaña está activa: ese estado
// vive en ItemDetailTabs, por debajo. Decidido (P9 del plan 06): la sinopsis
// se queda en el cuerpo de Info y esta cabecera es igual en las tres
// pestañas, como los frames 9 y 10.
export function ItemHeaderWide({
  itemType,
  mediaLabel,
  title,
  byline,
  avgRating,
  ratingsLabel,
}: {
  itemType: ItemType;
  mediaLabel: string;
  title: string;
  byline: string | null;
  /** Nota media 1–10 de la comunidad, o null si nadie ha puntuado. */
  avgRating: number | null;
  ratingsLabel: string;
}) {
  const accent = MEDIA_ACCENT[itemType];
  const Icon = TYPE_ICON[itemType];

  return (
    // Sin el difuminado de la portada (.desk-bd de la maqueta): en el ancho de
    // PC el degradado teñía media pantalla y ensuciaba el fondo en vez de dar
    // ambiente. La cabecera va sobre el papel liso, como el resto de la app.
    <div className="px-11 pt-[34px] pb-6">
      <div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-chip border ${accent.borderSoft} ${accent.bgSoft} px-2.5 py-1 font-mono text-[10px] font-medium tracking-wider ${accent.text} uppercase`}
        >
          <Icon className="h-3 w-3" />
          {mediaLabel}
        </span>

        <h1 className="mt-3.5 font-serif text-[44px] leading-[1.02] font-semibold tracking-[-0.01em]">
          {title}
        </h1>

        {/* En PC el byline es serif de 22px, no el mono de 11 del móvil. */}
        {byline && (
          <p className="mt-2.5 font-serif text-[22px] text-foreground-soft">
            {byline}
          </p>
        )}

        {avgRating !== null && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <RatingDots value={avgRating} size="lg" />
            <span
              className={`font-serif text-[26px] leading-none font-semibold ${accent.text}`}
            >
              {formatDots(avgRating)}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {ratingsLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
