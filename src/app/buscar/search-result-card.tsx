import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { SearchResult } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { OpenResultButton } from "./open-result-button";

// La tarjeta muestra portada, título, autoría y año — y nada más. Editorial y
// páginas ya no salen: son de una tirada concreta, no de la obra, y la mediana
// que se pintaba antes no era el número de páginas de ningún libro real. Ver el
// spec de 2026-07-14 (escalera de hidratación, peldaño 1).
export async function SearchResultCard({ result }: { result: SearchResult }) {
  const t = await getTranslations("search");
  const editionCount = result.editionCount ?? 1;

  const content = (
    <>
      {/* El borde de la portada se tiñe del tipo (`.rc .cvw`, 1.5px al 40% del
          acento): es lo que da la lectura de tipo en la rejilla ahora que la
          tarjeta no lleva botón de añadir. */}
      <div
        className={`relative aspect-2/3 w-full overflow-hidden rounded-card border-[1.5px] bg-surface-muted ${MEDIA_ACCENT[result.itemType].borderSoft}`}
      >
        {result.coverUrl ? (
          <Image
            src={result.coverUrl}
            alt={result.title}
            fill
            sizes="(max-width: 768px) 45vw, 200px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
            {result.title}
          </div>
        )}
        {editionCount > 1 && (
          <span className="absolute right-1.5 top-1.5 rounded-full border border-border bg-surface/90 px-2 py-0.5 font-mono text-[10px] font-medium text-foreground backdrop-blur">
            {t("editions", { count: editionCount })}
          </span>
        )}
      </div>
      <div className="flex flex-col">
        <span className="line-clamp-2 font-serif text-sm font-semibold text-foreground">
          {result.title}
        </span>
        {/* `.mm.it`: la autoría va en serif itálica, no en la sans de los
            metadatos sueltos. */}
        {(result.subtitle || result.year) && (
          <span className="line-clamp-1 font-serif text-[11px] italic text-muted-foreground">
            {[result.subtitle, result.year].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
    </>
  );

  // Ya cacheado: enlace normal a su ficha. Todavía no: botón que la crea al
  // pulsarlo (ver open-result-button.tsx).
  if (!result.catalogId) {
    return <OpenResultButton result={result}>{content}</OpenResultButton>;
  }

  return (
    <Link
      href={itemHref(result.itemType, result.catalogId)}
      className="group flex flex-col gap-2 rounded-lg transition hover:-translate-y-0.5"
    >
      {content}
    </Link>
  );
}
