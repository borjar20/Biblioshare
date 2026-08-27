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
// El chip activo: `text-accent-ink` y SIN relleno. El acento puro daba 3,8:1
// sobre su propio tinte al 10 %, y hasta `--accent-ink` se queda en 4,27:1 ahí
// — por debajo del 4,5:1 de WCAG 1.4.3. Quitar el tinte deja la tinta sobre la
// superficie limpia (4,88:1) y además es lo que decía la maqueta desde el
// principio: «se tiñe de accent en texto y borde EN VEZ de rellenarse».
function pillClass(active: boolean) {
  return `rounded-chip border px-[11px] py-1.5 font-mono text-[10.5px] font-medium tracking-[0.03em] uppercase transition-colors ${
    active
      ? "border-accent bg-surface text-accent-ink"
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
    // El filtro activo se marcaba SOLO por color: para un lector de pantalla
    // los cinco chips eran indistinguibles entre sí.
    <div role="group" aria-label={t("label")} className="flex flex-wrap items-center gap-[7px]">
      <Link
        href={href()}
        aria-current={!filter ? "page" : undefined}
        className={pillClass(!filter)}
      >
        {t("all")}
      </Link>
      {OPTIONS.map((option) => (
        <Link
          key={option.filter}
          href={href(option.filter)}
          aria-current={filter === option.filter ? "page" : undefined}
          className={pillClass(filter === option.filter)}
        >
          {t(option.key)}
        </Link>
      ))}
    </div>
  );
}
