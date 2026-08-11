import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { LibraryItem } from "@/lib/library/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { itemHref } from "@/lib/catalog/item-href";
import { buttonVariants } from "@/components/ui/button";
import { TodayHeader } from "./today-header";
import { StartButton } from "./start-button";

// Estado 3 (nada en curso ni en cola, pero hay colección): "¿Qué empezamos?".
// Sugiere 2–3 títulos ya completados para releer; "Empezar" abre un pase nuevo
// (planTransition → archiveAndCreate) sin sacar del Inicio.
export async function CollectionSuggestions({ items }: { items: LibraryItem[] }) {
  const t = await getTranslations("today");
  const tMedia = await getTranslations("detail.mediaLabel");
  return (
    <section className="flex flex-col gap-3">
      <TodayHeader title={t("collectionTitle")} />
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const accent = MEDIA_ACCENT[item.itemType];
          return (
            <article
              key={item.entryId}
              className="relative flex gap-3 overflow-hidden rounded-[12px] border border-border bg-surface p-3 shadow-card"
              style={{ ["--acc" as string]: `var(${accent.varName})` }}
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--acc)]" />
              <Link
                href={itemHref(item.itemType, item.itemId)}
                className="relative h-[72px] w-12 shrink-0 overflow-hidden rounded-sm bg-surface-muted shadow-cover"
              >
                {item.coverUrl && (
                  <Image src={item.coverUrl} alt="" fill sizes="48px" className="object-cover" />
                )}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-[var(--acc)]">
                  {tMedia(item.itemType)}
                </p>
                <Link
                  href={itemHref(item.itemType, item.itemId)}
                  className="mt-0.5 line-clamp-2 font-serif text-[13px] leading-[1.14] font-semibold text-foreground hover:underline"
                >
                  {item.title}
                </Link>
                <StartButton
                  itemType={item.itemType}
                  itemId={item.itemId}
                  label={t("startCta")}
                  className={buttonVariants("primary", "mt-auto self-start px-3 py-1 text-[12px]")}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
