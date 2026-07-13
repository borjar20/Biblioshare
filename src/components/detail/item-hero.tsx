import Image from "next/image";
import type { ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { RatingDots } from "@/components/ui/rating-dots";
import { GenreTag } from "@/components/ui/genre-tag";
import { BackButton } from "./back-button";
import { BookIcon, FilmIcon, SeriesIcon } from "@/components/ui/icons";

const TYPE_ICON = {
  book: BookIcon,
  movie: FilmIcon,
  series: SeriesIcon,
} as const;

// Editorial detail hero (reel+shelf structure, Biblioshare palette): a blurred
// cover backdrop fading into the page, the cover thumbnail, media badge + genre
// tags, serif title, byline, community rating readout, and a slot for the
// viewer's own status/actions.
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
}) {
  const accent = MEDIA_ACCENT[itemType];
  const Icon = TYPE_ICON[itemType];

  return (
    <div className="relative overflow-hidden border-b border-border">
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

      <div className="relative mx-auto w-full max-w-4xl px-4 pt-6 pb-8 sm:px-6">
        <BackButton label={backLabel} />

        <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-end">
          <div
            className={`relative aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-cover border-2 ${accent.borderSoft} bg-surface-muted shadow-cover sm:w-40`}
          >
            {coverUrl ? (
              <Image
                src={coverUrl}
                alt={title}
                fill
                sizes="(max-width: 640px) 128px, 160px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                {title}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 pb-1">
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

            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {title}
            </h1>

            {byline && (
              <p className="font-mono text-xs text-muted-foreground">{byline}</p>
            )}

            {avgRating !== null && (
              <div className="flex items-center gap-3">
                <span
                  className={`font-serif text-3xl leading-none font-bold ${accent.text}`}
                >
                  {avgRating.toFixed(1)}
                </span>
                <div className="flex flex-col gap-1">
                  <RatingDots value={avgRating / 2} />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {ratingCount.toLocaleString("es")} {ratingsLabel}
                  </span>
                </div>
              </div>
            )}

            {statusSlot && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {statusSlot}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
