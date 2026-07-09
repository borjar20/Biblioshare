import { getTranslations } from "next-intl/server";
import type { LibraryStats } from "@/lib/library/get-library-stats";
import { BookIcon, SeriesIcon, FilmIcon } from "@/components/ui/icons";

// Overview stat cards (reel+shelf structure): one big serif count per media
// type, tinted with that type's accent.
export async function ProfileStatCards({ stats }: { stats: LibraryStats }) {
  const t = await getTranslations("profile");

  const cards = [
    {
      key: "book",
      value: stats.book,
      label: t("typeBooks"),
      text: "text-type-book",
      border: "border-type-book/30",
      Icon: BookIcon,
    },
    {
      key: "series",
      value: stats.series,
      label: t("typeSeries"),
      text: "text-type-series",
      border: "border-type-series/30",
      Icon: SeriesIcon,
    },
    {
      key: "movie",
      value: stats.movie,
      label: t("typeFilms"),
      text: "text-type-movie",
      border: "border-type-movie/30",
      Icon: FilmIcon,
    },
  ] as const;

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map(({ key, value, label, text, border, Icon }) => (
        <div
          key={key}
          className={`flex flex-col gap-1.5 rounded-xl border ${border} bg-surface p-4`}
        >
          <Icon className={`h-4 w-4 ${text}`} />
          <span className={`font-serif text-3xl leading-none font-bold ${text}`}>
            {value}
          </span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
