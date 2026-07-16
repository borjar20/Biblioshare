import Image from "next/image";
import type { ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { GenreTag } from "@/components/ui/genre-tag";
import { BackButton } from "./back-button";
import { BookIcon, FilmIcon, SeriesIcon } from "@/components/ui/icons";

const TYPE_ICON = {
  book: BookIcon,
  movie: FilmIcon,
  series: SeriesIcon,
} as const;

// Hero de la ficha, calcado del mockup "Paper - Ficha de título completa"
// (.hero-*, los 7 frames comparten hero): portada difuminada de fondo, barra
// superior (volver + tipo de medio + hueco del menú), portada con borde del
// acento, badge + géneros, título serif, byline mono, nota de la comunidad y
// la píldora de estado del usuario.
//
// La maqueta es de móvil: ahí se calca (fila de 116×174). En sm+ se ensancha
// —portada mayor, más aire— según el principio responsive P-T7.
export function ItemHero({
  itemType,
  mediaLabel,
  title,
  byline,
  genres,
  coverUrl,
  avgRating,
  ratingCount,
  ratingsLabel,
  backLabel,
  statusSlot,
  menuSlot,
}: {
  itemType: ItemType;
  mediaLabel: string;
  title: string;
  byline: string | null;
  genres: string[];
  coverUrl: string | null;
  /** Nota media 1–10 (agregado real de la comunidad) o null si nadie ha puntuado. */
  avgRating: number | null;
  ratingCount: number;
  ratingsLabel: string;
  backLabel: string;
  statusSlot?: ReactNode;
  /** El menú `⋯` (HeroMenu); sin él, un hueco simétrico centra el label. */
  menuSlot?: ReactNode;
}) {
  const accent = MEDIA_ACCENT[itemType];
  const Icon = TYPE_ICON[itemType];

  return (
    // Sin border-b: la línea la pone la barra de pestañas, que va pegada
    // debajo y es sticky (mockup .tabs). Dos bordes seguidos se veían doble.
    <div className="relative overflow-hidden">
      {coverUrl && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <Image
            src={coverUrl}
            alt=""
            fill
            sizes="100vw"
            className="scale-110 object-cover opacity-25 blur-2xl"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
        </div>
      )}

      <div className="relative mx-auto w-full max-w-4xl px-4 pt-3.5 pb-5 sm:px-6">
        {/* .hero-top: volver a la izquierda, tipo de medio centrado y teñido,
            y el menú ⋯ a la derecha (P2). El propio HeroMenu pinta el hueco
            simétrico cuando no tiene nada que ofrecer; sin slot, lo pinta
            este layout para que el label siga centrado. */}
        <div className="flex items-center justify-between gap-3">
          <BackButton label={backLabel} />
          <span
            className={`truncate font-mono text-[10.5px] font-medium tracking-[0.12em] uppercase ${accent.text}`}
          >
            {mediaLabel}
          </span>
          {menuSlot ?? <span aria-hidden className="h-[34px] w-[34px] shrink-0" />}
        </div>

        <div className="mt-2 flex gap-4 sm:mt-4 sm:gap-6">
          <div
            className={`relative h-[174px] w-[116px] shrink-0 overflow-hidden rounded-[6px] border-2 ${accent.border} bg-surface-muted shadow-cover sm:h-[240px] sm:w-40`}
          >
            {coverUrl ? (
              <Image
                src={coverUrl}
                alt={title}
                fill
                sizes="(max-width: 640px) 116px, 160px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                {title}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-chip border ${accent.borderSoft} ${accent.bgSoft} px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider ${accent.text} uppercase`}
              >
                <Icon className="h-3 w-3" />
                {mediaLabel}
              </span>
              {genres.slice(0, 3).map((g) => (
                <GenreTag key={g} label={g} />
              ))}
            </div>

            <h1 className="mt-2 font-serif text-[25px] leading-[1.05] font-semibold sm:text-[34px]">
              {title}
            </h1>

            {byline && (
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                {byline}
              </p>
            )}

            {/* Nota de la comunidad: estrellas oro sobre 5 (P1 del plan 06 —
                los agregados de la comunidad van en estrellas; los dots se
                reservan para la nota propia 1–10). */}
            {avgRating !== null && (
              <div className="mt-3 flex items-center gap-2.5">
                <span
                  className={`font-serif text-[30px] leading-none font-semibold ${accent.text}`}
                >
                  {formatDots(avgRating)}
                  <small className="text-sm font-normal text-muted-foreground">
                    /5
                  </small>
                </span>
                <div className="flex flex-col gap-1">
                  <RatingDots value={avgRating} size="sm" />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {ratingCount.toLocaleString("es")} {ratingsLabel}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* .hero-status: fuera de la fila de la portada, alineada a su
            izquierda (la maqueta la saca del hero-main a propósito). */}
        {statusSlot && (
          <div className="mt-3 flex flex-wrap gap-2">{statusSlot}</div>
        )}
      </div>
    </div>
  );
}
