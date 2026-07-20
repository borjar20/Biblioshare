import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

const TYPES: ItemType[] = ["book", "movie", "series"];

// Píldoras de tipo con dot de color (`.typ` de las maquetas de Buscar): las
// usan tanto /buscar como /buscar/manual, que dibujan el MISMO control con
// distinto destino — de ahí el `href` como función en vez de duplicar el markup.
export async function TypePills({
  active,
  href,
}: {
  active: ItemType;
  href: (type: ItemType) => string;
}) {
  const t = await getTranslations("search");

  return (
    <div className="flex gap-2">
      {TYPES.map((type) => {
        const on = type === active;

        return (
          <Link
            key={type}
            href={href(type)}
            className={`inline-flex items-center gap-2 rounded-full border px-[15px] py-2 text-[13px] font-semibold transition-colors ${
              on
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            {/* Dot del color del tipo (`.typ i`, 9px). En la píldora activa va
                blanco: sobre el relleno de accent, el color del tipo no
                contrastaría. */}
            <span
              aria-hidden
              className={`h-[9px] w-[9px] shrink-0 rounded-full ${
                on ? "bg-accent-foreground" : MEDIA_ACCENT[type].bg
              }`}
            />
            {t(`types.${type}`)}
          </Link>
        );
      })}
    </div>
  );
}
