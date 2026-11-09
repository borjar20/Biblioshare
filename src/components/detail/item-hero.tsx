import type { ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { posterTitleClass } from "@/lib/catalog/poster-art";
import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { GenreTag } from "@/components/ui/genre-tag";
import { BookIcon, FilmIcon, SeriesIcon } from "@/components/ui/icons";
import { POSTER_HEADER } from "./detail-container";

const TYPE_ICON = {
  book: BookIcon,
  movie: FilmIcon,
  series: SeriesIcon,
} as const;

// La cabecera del cartel (spec 2026-11-09): tipo, título, autor, nota y la
// tarjeta «tu pase», en UNA sola instancia. La imagen y la barra de móvil viven
// en ItemShell. Hasta `xl` se monta sobre el degradado del cartel; desde `xl` va
// en la columna derecha.
export function ItemHero({
  itemType,
  mediaLabel,
  title,
  byline,
  genres,
  avgRating,
  ratingsLabel,
  passCard,
}: {
  itemType: ItemType;
  mediaLabel: string;
  title: string;
  byline: string | null;
  genres: string[];
  /** Nota media 1–10 de la comunidad, o null si nadie ha puntuado. */
  avgRating: number | null;
  ratingsLabel: string;
  passCard: ReactNode;
}) {
  const accent = MEDIA_ACCENT[itemType];
  const Icon = TYPE_ICON[itemType];

  return (
    <div className={POSTER_HEADER}>
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
        className={`mt-2 [overflow-wrap:anywhere] leading-[0.97] uppercase ${posterTitleClass(title)}`}
        style={{
          fontFamily: "var(--font-poster), var(--font-geist-sans), sans-serif",
          color: "var(--work-title)",
        }}
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

      <div className="mt-4 max-w-[420px]">{passCard}</div>
    </div>
  );
}
