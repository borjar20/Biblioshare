"use client";
import { useTranslations } from "next-intl";
import type { LibraryStats } from "@/lib/library/get-library-stats";
import { formatAverage } from "@/lib/profile/figures";

// Cifras grandes (spec §3.1 punto 3). Los recuentos son los de hoy
// (`getLibraryStats`, pases activos); la media, la de sus pases terminados.
export function FiguresView({
  stats,
  rating,
}: {
  stats: LibraryStats;
  rating: { average: number | null; count: number };
}) {
  const t = useTranslations("profile.visual.figures");
  const cell = (value: string, label: string, title?: string) => (
    <div className="min-w-0" title={title}>
      <div className="font-serif text-[26px] font-semibold leading-none text-foreground lg:text-[30px]">{value}</div>
      <div className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[.07em] text-muted-foreground">
        {label}
        {title && <span className="sr-only"> · {title}</span>}
      </div>
    </div>
  );
  return (
    <div data-testid="profile-figures" className="grid grid-cols-4 gap-2">
      {cell(String(stats.book), t("books", { count: stats.book }))}
      {cell(String(stats.movie), t("movies", { count: stats.movie }))}
      {cell(String(stats.series), t("series", { count: stats.series }))}
      {rating.average === null
        ? cell(t("noRating"), t("rating"), t("noRatingHint"))
        : cell(formatAverage(rating.average), t("rating"))}
    </div>
  );
}
