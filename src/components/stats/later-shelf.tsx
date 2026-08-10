import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { LibraryItem } from "@/lib/library/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { itemHref } from "@/lib/catalog/item-href";
import { ChevronRightIcon } from "@/components/ui/icons";

// "Para más tarde" (frame G): la cola de pendientes como estantería, al lado de
// lo que tienes a medias.
//
// Es un ATAJO, no una copia de Colección — la duda que el plan dejó abierta.
// Enseña un puñado de portadas de una cola que puede tener 32, sin filtros, sin
// orden y sin rejilla: para elegir lo próximo de un vistazo. Cuando quieres
// gestionarla de verdad, "Ver todos" te deja en /coleccion?status=planned, que
// es la vista completa. Duplicar sería pintar aquí la rejilla entera.
//
// SIN la casilla "+" del frame (decisión del usuario, 2026-07-17): era el
// gemelo de "Registrar algo nuevo", que se descartó. Añadir a la cola sigue
// siendo cosa de Buscar, donde vive la escalera de hidratación.
export function LaterShelf({ items, total }: { items: LibraryItem[]; total: number }) {
  return (
    <section className="flex flex-col gap-2">
      <Header total={total} />
      {/* Carrusel de una fila salvo con 3 columnas. Móvil (<768): sangra hasta
          el borde (frame G). Tablet (768–1099): carrusel CONTENIDO (`mx-0`, sin
          sangrado que se meta en la columna de stats, sin envolver) para que lo
          personal no crezca en alto y empuje el feed. Solo de 1100 para arriba
          —donde lo personal tiene columna propia y alta— las portadas envuelven
          en filas. */}
      <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0 min-[1100px]:flex-wrap">
        {items.map((item) => (
          <Cover key={item.entryId} item={item} />
        ))}
      </div>
    </section>
  );
}

async function Header({ total }: { total: number }) {
  const t = await getTranslations("today");
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
        {t("later")}
      </span>
      <Link
        href="/coleccion?status=planned"
        className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.06em] uppercase text-accent hover:underline"
      >
        {t("seeAll", { count: total })}
        <ChevronRightIcon className="h-3 w-3" />
      </Link>
    </div>
  );
}

// A la ficha, no al pase: un pendiente no tiene sesión que registrar todavía.
// Es la diferencia con las mini de arriba, que suben al destacado porque ahí sí
// hay algo que hacer sin salir del Inicio.
function Cover({ item }: { item: LibraryItem }) {
  const accent = MEDIA_ACCENT[item.itemType];
  return (
    <Link
      href={itemHref(item.itemType, item.itemId)}
      className="w-[66px] shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-md bg-surface-muted shadow-cover"
        style={{ ["--acc" as string]: `var(${accent.varName})` }}
      >
        {item.coverUrl ? (
          <Image src={item.coverUrl} alt="" fill sizes="66px" className="object-cover" />
        ) : (
          // Sin portada, el color del tipo es lo único que distingue una de
          // otra: mejor un lomo teñido que un rectángulo gris anónimo.
          <span aria-hidden className="absolute inset-0 bg-[var(--acc)]/15" />
        )}
        <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-[var(--acc)]" />
      </div>
      <p className="mt-[5px] line-clamp-2 font-serif text-[10.5px] leading-[1.12] font-semibold text-foreground">
        {item.title}
      </p>
    </Link>
  );
}
