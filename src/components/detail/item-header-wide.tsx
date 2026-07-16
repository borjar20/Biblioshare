import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { StarRating } from "@/components/ui/star-rating";
import { formatStars } from "@/lib/rating/stars";
import { BookIcon, FilmIcon, SeriesIcon } from "@/components/ui/icons";

const TYPE_ICON = {
  book: BookIcon,
  movie: FilmIcon,
  series: SeriesIcon,
} as const;

// La cabecera de la columna derecha en PC (.desk-header de los frames 8-12).
// NO es el hero móvil ensanchado: aquí no hay botón de volver, ni label de
// tipo centrado, ni píldora "En tu biblioteca ·" — el estado es un control del
// rail. Los frames 9 y 10 se paran en la nota; solo Info (frame 8) alarga la
// cabecera con sinopsis, géneros y datos, que llegan por `extra`.
export function ItemHeaderWide({
  itemType,
  mediaLabel,
  title,
  byline,
  avgRating,
  ratingCount,
  ratingsLabel,
  extra,
}: {
  itemType: ItemType;
  mediaLabel: string;
  title: string;
  byline: string | null;
  /** Nota media 1–10 de la comunidad, o null si nadie ha puntuado. */
  avgRating: number | null;
  ratingCount: number;
  ratingsLabel: string;
  /** Solo Info: sinopsis + géneros + datos (frame 8). */
  extra?: React.ReactNode;
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
            <StarRating value={avgRating} size="lg" />
            <span
              className={`font-serif text-[26px] leading-none font-semibold ${accent.text}`}
            >
              {formatStars(avgRating)}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {ratingCount.toLocaleString("es")} {ratingsLabel}
            </span>
          </div>
        )}

        {extra}
      </div>
    </div>
  );
}
