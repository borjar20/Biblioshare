import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { FeedFilter } from "@/lib/social/feed";

// Chips mono del mockup "IA nueva": el filtro activo se tiñe de accent en
// texto y borde en vez de rellenarse.
//
// El padding (11px) y el tracking (.03em) son los de la maqueta al milímetro, y
// aquí eso importa: los cinco chips caben en UNA fila a 400px por los pelos
// (360px de ancho útil). Con px-3 y tracking-wider, "Clubes" se caía a una
// segunda fila.
function pillClass(active: boolean) {
  return `rounded-chip border px-[11px] py-1.5 font-mono text-[10.5px] font-medium tracking-[0.03em] uppercase transition-colors ${
    active
      ? "border-accent bg-accent/10 text-accent"
      : "border-border bg-surface text-muted-foreground hover:text-foreground"
  }`;
}

// Set del frame A, de selección única (P2): Todo · Reseñas · Libros · Pantalla
// · Clubes. "Pantalla" junta películas y series — la maqueta no las separa
// aquí; para eso está Colección.
const OPTIONS: readonly { filter: FeedFilter; key: string }[] = [
  { filter: "reviews", key: "reviews" },
  { filter: "book", key: "books" },
  { filter: "screen", key: "screen" },
  { filter: "clubs", key: "clubs" },
];

export async function FeedFilters({ filter }: { filter?: FeedFilter }) {
  const t = await getTranslations("feed.filters");

  function href(next?: FeedFilter) {
    return next ? `/?filtro=${next}` : "/";
  }

  return (
    <div className="flex flex-wrap items-center gap-[7px]">
      <Link href={href()} className={pillClass(!filter)}>
        {t("all")}
      </Link>
      {OPTIONS.map((option) => (
        <Link
          key={option.filter}
          href={href(option.filter)}
          className={pillClass(filter === option.filter)}
        >
          {t(option.key)}
        </Link>
      ))}
    </div>
  );
}
