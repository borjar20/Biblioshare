import Image from "next/image";
import type { ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { GenreTag } from "@/components/ui/genre-tag";
import { BookIcon, FilmIcon, SeriesIcon } from "@/components/ui/icons";
import { ImageZoom } from "@/components/ui/image-zoom";
import { BackButton } from "./back-button";
import { DETAIL_CONTAINER } from "./detail-container";
import { pickHeroBackground, type HeroBackground } from "./hero-background";

const TYPE_ICON = {
  book: BookIcon,
  movie: FilmIcon,
  series: SeriesIcon,
} as const;

// Umbral a partir del cual la serif de PC baja de 44 a 34px (spec §4).
const LONG_TITLE = 40;

// Hero cinemático de la ficha (spec 2026-09-23-ficha-cinematica-design.md §1):
// UN árbol para móvil y PC, no dos que se esconden por breakpoint como antes.
//
// - Fondo a todo el ancho: backdrop de TMDB → portada difuminada y teñida →
//   degradado del acento (pickHeroBackground). El degradado llega a
//   --background ANTES del bloque de título: nunca hay texto sobre la imagen
//   nítida, tampoco en oscuro (el token cambia solo).
// - Rejilla de tres piezas y la tarjeta «tu pase» en UNA sola instancia:
//     móvil/lg → [portada | título] y la tarjeta debajo, a lo ancho del título
//     xl       → [portada | título | tarjeta], alineadas por abajo
//   En lg estrecho (1024–1279) la tarjeta cae bajo el título en vez de
//   aplastarlo (spec §4).
// - La barra ← · tipo · ⋯ solo en móvil: en PC ya está la topbar del sitio.
export function ItemHero({
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
}: {
  itemType: ItemType;
  mediaLabel: string;
  title: string;
  byline: string | null;
  genres: string[];
  coverUrl: string | null;
  backdropUrl: string | null;
  /** Nota media 1–10 de la comunidad, o null si nadie ha puntuado. */
  avgRating: number | null;
  ratingsLabel: string;
  backLabel: string;
  menuSlot?: ReactNode;
  passCard: ReactNode;
}) {
  const accent = MEDIA_ACCENT[itemType];
  const Icon = TYPE_ICON[itemType];
  const background = pickHeroBackground({ backdropUrl, coverUrl });
  const coverClass = `relative h-[165px] w-[110px] shrink-0 overflow-hidden rounded-[6px] border-2 ${accent.border} bg-surface-muted shadow-cover sm:h-[210px] sm:w-[140px] lg:h-[300px] lg:w-[200px]`;
  const titleSize =
    title.length > LONG_TITLE ? "lg:text-[34px]" : "lg:text-[44px]";

  return (
    <div className="relative">
      <HeroBackdrop background={background} itemType={itemType} />

      <div className={`relative ${DETAIL_CONTAINER} pt-3.5 pb-5 lg:pt-[190px] lg:pb-8`}>
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <BackButton label={backLabel} />
          <span
            className={`truncate font-mono text-[10.5px] font-medium tracking-[0.12em] uppercase ${accent.text}`}
          >
            {mediaLabel}
          </span>
          {menuSlot ?? <span aria-hidden className="h-[34px] w-[34px] shrink-0" />}
        </div>

        <div className="mt-[64px] grid grid-cols-[110px_minmax(0,1fr)] items-end gap-x-4 gap-y-4 sm:mt-[48px] sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-x-6 lg:mt-0 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-9 xl:grid-cols-[200px_minmax(0,1fr)_300px]">
          {coverUrl ? (
            <ImageZoom src={coverUrl} alt={title} className={coverClass}>
              <Image
                src={coverUrl}
                alt={title}
                fill
                priority
                sizes="(max-width: 640px) 110px, (max-width: 1024px) 140px, 200px"
                className="object-cover"
              />
            </ImageZoom>
          ) : (
            <div className={coverClass}>
              <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                {title}
              </div>
            </div>
          )}

          <div className="min-w-0 pb-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`hidden items-center gap-1.5 rounded-chip border ${accent.borderSoft} ${accent.bgSoft} px-2.5 py-1 font-mono text-[10px] font-medium tracking-wider ${accent.text} uppercase lg:inline-flex`}
              >
                <Icon className="h-3 w-3" />
                {mediaLabel}
              </span>
              {genres.slice(0, 3).map((g) => (
                <GenreTag key={g} label={g} />
              ))}
            </div>

            <h1
              className={`mt-2 font-serif text-[25px] leading-[1.05] font-semibold sm:text-[32px] lg:mt-3 lg:leading-[1.02] lg:tracking-[-0.01em] ${titleSize}`}
            >
              {title}
            </h1>

            {byline && (
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground lg:mt-2.5 lg:font-serif lg:text-[20px] lg:text-foreground-soft">
                {byline}
              </p>
            )}

            {avgRating !== null && (
              <div className="mt-3 flex flex-wrap items-center gap-2.5 lg:mt-4">
                <RatingDots value={avgRating} size="sm" itemType={itemType} />
                <span
                  className={`font-serif text-[22px] leading-none font-semibold lg:text-[26px] ${accent.text}`}
                >
                  {formatDots(avgRating)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground lg:text-[11px]">
                  {ratingsLabel}
                </span>
              </div>
            )}
          </div>

          <div className="col-span-2 lg:col-span-1 lg:col-start-2 xl:col-start-3">
            {passCard}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroBackdrop({
  background,
  itemType,
}: {
  background: HeroBackground;
  itemType: ItemType;
}) {
  const accent = MEDIA_ACCENT[itemType];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[240px] overflow-hidden sm:h-[280px] lg:h-[420px]"
    >
      {background.kind === "backdrop" && (
        // El backdrop es el LCP de la ficha de peli/serie: precarga.
        <Image
          src={background.src}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_25%]"
        />
      )}
      {background.kind === "cover" && (
        <>
          {/* Misma URL que la portada en primer plano (el loader colapsa los
              buckets, ver cdn-loader.ts): reaprovecha su precarga. */}
          <Image
            src={background.src}
            alt=""
            fill
            sizes="100vw"
            className="scale-125 object-cover opacity-60 blur-2xl"
          />
          <div className={`absolute inset-0 ${accent.bg} opacity-30 mix-blend-multiply`} />
        </>
      )}
      {background.kind === "none" && <div className={`absolute inset-0 ${accent.bgSoft}`} />}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-20% via-background/75 via-60% to-background" />
    </div>
  );
}
