import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { LibraryItem } from "@/lib/library/types";
import { itemHref } from "@/lib/catalog/item-href";
import { getProgress } from "@/lib/library/progress";
import { ProgressBar } from "@/components/ui/progress-bar";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

// Los ítems en curso, fijados arriba de la Colección como tarjetas "continuar"
// (Paper - Colección.html). Es lo primero que quieres ver al abrir tu
// biblioteca: lo que tienes a medias.
export async function ContinueStrip({ items }: { items: LibraryItem[] }) {
  const t = await getTranslations("collection");
  const tTypes = await getTranslations("search.types");

  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      {/* pin-head del mockup: dot de acento + eyebrow + contador a la derecha. */}
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
        <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("continue")}
        </h2>
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
          {items.length}
        </span>
      </div>

      {/* Una sola columna en todos los anchos (frame A móvil; frame C las apila
          dentro de la columna izquierda del escritorio). */}
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const accent = MEDIA_ACCENT[item.itemType];
          const progress = getProgress(item);

          return (
            <Link
              key={item.entryId}
              href={itemHref(item.itemType, item.itemId)}
              className="group flex gap-3 overflow-hidden rounded-card border border-border bg-surface p-3 shadow-card transition-colors hover:bg-surface-muted"
            >
              {/* Banda de acento izquierda por tipo (mockup .cont::before). */}
              <span
                aria-hidden
                className={`-my-3 -ml-3 w-1 shrink-0 self-stretch ${accent.bg}`}
              />
              <div
                className={`relative h-[87px] w-[58px] shrink-0 overflow-hidden rounded-[5px] border ${accent.borderSoft} bg-surface-muted`}
              >
                {item.coverUrl ? (
                  <Image
                    src={item.coverUrl}
                    alt={item.title}
                    fill
                    sizes="58px"
                    className="object-cover"
                  />
                ) : null}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={`font-mono text-[9px] tracking-widest uppercase ${accent.text}`}
                >
                  {tTypes(item.itemType)}
                </span>
                <span className="line-clamp-2 font-serif text-[15px] font-semibold text-foreground">
                  {item.title}
                </span>
                {item.subtitle && (
                  <span className="line-clamp-1 font-serif text-[11.5px] italic text-muted-foreground">
                    {item.subtitle}
                  </span>
                )}

                <div className="mt-auto flex items-end justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {progress ? (
                      <ProgressBar
                        current={progress.current}
                        total={progress.total}
                        label={progress.label}
                      />
                    ) : (
                      <span className={`font-mono text-[10px] ${accent.text}`}>
                        {t("inProgress")}
                      </span>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-semibold ${accent.text}`}
                  >
                    {t("continueCta")}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
