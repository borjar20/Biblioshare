import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

export type CollectionTab = "general" | "book" | "movie" | "series" | "colas";

export const COLLECTION_TABS: CollectionTab[] = [
  "general",
  "book",
  "movie",
  "series",
  "colas",
];

// Igual que en el perfil: la pestaña activa se tiñe del color de su tipo de
// medio; general y colas usan el acento.
const ACTIVE_CLASSES: Record<CollectionTab, string> = {
  general: "border-accent text-foreground",
  book: `${MEDIA_ACCENT.book.border} ${MEDIA_ACCENT.book.text}`,
  movie: `${MEDIA_ACCENT.movie.border} ${MEDIA_ACCENT.movie.text}`,
  series: `${MEDIA_ACCENT.series.border} ${MEDIA_ACCENT.series.text}`,
  colas: "border-accent text-foreground",
};

export async function CollectionTabs({ active }: { active: CollectionTab }) {
  const t = await getTranslations("collection.tabs");

  return (
    <div className="flex gap-6 overflow-x-auto border-b border-border">
      {COLLECTION_TABS.map((tab) => {
        const href = tab === "general" ? "/coleccion" : `/coleccion?tab=${tab}`;
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={href}
            className={`-mb-px shrink-0 border-b-2 px-1 pt-2 pb-3 font-serif text-[15.5px] font-semibold transition-colors ${
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
