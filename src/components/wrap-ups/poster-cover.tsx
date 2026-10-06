"use client";
// Carta de portada del póster. Si la portada externa falla (o no hay), carta
// pixel con el título y el glifo del tipo: nunca un hueco roto (spec §5).
import Image from "next/image";
import { useState } from "react";
import type { ItemRef } from "@/lib/wrap-ups/types";
import styles from "./poster.module.css";

export const TYPE_GLYPH: Record<ItemRef["type"], string> = { book: "●", movie: "■", series: "▲" };

export function PosterCover({ item }: { item: ItemRef }) {
  const [broken, setBroken] = useState(false);
  return (
    <li className={styles.coverCard}>
      {item.coverUrl && !broken ? (
        <Image src={item.coverUrl} alt={item.title} fill sizes="120px" onError={() => setBroken(true)} />
      ) : (
        <div className={styles.coverFallback}>
          <span className={styles.coverGlyph} aria-hidden="true">{TYPE_GLYPH[item.type]}</span>
          <span>{item.title}</span>
        </div>
      )}
    </li>
  );
}
