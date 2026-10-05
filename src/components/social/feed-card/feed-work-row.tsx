import Link from "next/link";
import type { ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { SpineCover } from "../spine-cover";

// Fila de obra del patrón C: portada pequeña · lo que pasó como título (serif)
// · datos en mono · el valor a la derecha (nota, %, botón). `children` va bajo
// los datos, en la misma columna (p. ej. la mini-lista de episodios).
const COVER = { md: 30, sm: 24 } as const;

export function FeedWorkRow({
  itemType,
  itemId,
  coverUrl,
  title,
  facts,
  trailing,
  size = "md",
  children,
}: {
  itemType: ItemType;
  itemId: string;
  coverUrl: string | null;
  title: string;
  facts: string;
  trailing?: ReactNode;
  size?: keyof typeof COVER;
  children?: ReactNode;
}) {
  const href = itemHref(itemType, itemId);
  const px = COVER[size];
  return (
    <div className={`flex gap-2.5 ${children ? "items-start" : "items-center"}`}>
      <Link href={href} className="shrink-0" style={{ width: px }} tabIndex={-1} aria-hidden>
        <SpineCover coverUrl={coverUrl} title={title} sizes={`${px}px`} className="aspect-[2/3] w-full" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className={`block font-serif leading-tight font-semibold hover:underline ${size === "md" ? "text-[15px]" : "text-[13.5px]"}`}
        >
          {title}
        </Link>
        {facts && <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">{facts}</p>}
        {children}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
