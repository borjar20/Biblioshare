import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

export type SectionTab = "overview" | "book" | "movie" | "series";

const TABS: SectionTab[] = ["overview", "movie", "series", "book"];

// Active-tab colour: overview uses the plum accent, each media tab uses its own
// type accent (reel+shelf-style), so the underline signals what you're viewing.
const ACTIVE_CLASSES: Record<SectionTab, string> = {
  overview: "border-accent text-foreground",
  book: `${MEDIA_ACCENT.book.border} ${MEDIA_ACCENT.book.text}`,
  movie: `${MEDIA_ACCENT.movie.border} ${MEDIA_ACCENT.movie.text}`,
  series: `${MEDIA_ACCENT.series.border} ${MEDIA_ACCENT.series.text}`,
};

export async function SectionTabs({
  active,
  basePath,
}: {
  active: SectionTab;
  basePath: string;
}) {
  const t = await getTranslations("profile.tabs");

  return (
    <div className="flex gap-6 border-b border-border font-mono">
      {TABS.map((tab) => {
        const href = tab === "overview" ? basePath : `${basePath}?tab=${tab}`;
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={href}
            className={`-mb-px border-b-2 px-1 pb-3 text-xs font-medium tracking-wider uppercase transition-colors ${
              isActive
                ? ACTIVE_CLASSES[tab]
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(tab)}
          </Link>
        );
      })}
    </div>
  );
}
