"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { itemHref } from "@/lib/catalog/item-href";
import { buttonVariants } from "@/components/ui/button";
import { rotateIndex } from "@/lib/stats/rotate-index";
import { StartButton } from "./start-button";

export type NextUpItem = {
  itemId: string;
  itemType: ItemType;
  title: string;
  coverUrl: string | null;
};

// Estado 2: destaca UN pendiente para empezar. "Sugerirme otro" rota entre los
// que ya hay en la cola (sin recomendador). "Empezar" lo marca en curso y el
// bloque pasa solo a "En curso" (StartButton refresca). Es cliente porque el
// índice destacado y la rotación viven aquí; imágenes y etiquetas llegan ya
// resueltas del servidor a través de props/next-intl.
export function NextUpCard({ items }: { items: NextUpItem[] }) {
  const t = useTranslations("today");
  const tMedia = useTranslations("detail.mediaLabel");
  const [index, setIndex] = useState(0);

  const item = items[index] ?? items[0];
  if (!item) return null;
  const accent = MEDIA_ACCENT[item.itemType];

  return (
    <div
      className="relative overflow-hidden rounded-[14px] border border-border bg-surface p-4 shadow-card"
      style={{ ["--acc" as string]: `var(${accent.varName})` }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[var(--acc)]" />
      <div className="flex gap-3.5">
        <Link
          href={itemHref(item.itemType, item.itemId)}
          className="relative h-[108px] w-[72px] shrink-0 overflow-hidden rounded-md bg-surface-muted shadow-cover"
        >
          {item.coverUrl && (
            <Image src={item.coverUrl} alt={item.title} fill sizes="72px" className="object-cover" />
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-[var(--acc)]">
            {tMedia(item.itemType)}
          </p>
          <Link
            href={itemHref(item.itemType, item.itemId)}
            className="mt-0.5 line-clamp-2 font-serif text-[17px] leading-tight font-semibold text-foreground hover:underline"
          >
            {item.title}
          </Link>
          <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">
            {t("nextUpContext")}
          </p>
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <StartButton
          itemType={item.itemType}
          itemId={item.itemId}
          label={t("startCta")}
          className={buttonVariants("primary", "w-full sm:w-auto")}
        />
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => setIndex((i) => rotateIndex(i, items.length))}
            className="font-mono text-[11px] tracking-[0.04em] uppercase text-accent hover:underline"
          >
            {t("suggestAnother")}
          </button>
        )}
      </div>
    </div>
  );
}
