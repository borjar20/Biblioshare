"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import styles from "./closing.module.css";

const OBJECT: Record<ItemType, "lastPage" | "ticket" | "disc"> = { book: "lastPage", movie: "ticket", series: "disc" };

// El objeto en el que se cierra la obra (spec 2026-11-07): última página, entrada de
// cine o caja del último disco, con los mismos huecos: sello de fecha, texto (la
// reseña) y lacre. `closing` dispara su cierre (libro que se cierra, entrada que se
// perfora, caja que se precinta). Abandonar: sin lacre y con el marcapáginas dentro.
export function ClosingObject({
  itemType, variant, closing, stamp, seal, children,
}: {
  itemType: ItemType; variant: "completed" | "dropped"; closing: boolean; stamp: ReactNode; seal?: ReactNode; children: ReactNode;
}) {
  const t = useTranslations("ritual.closing");
  const kind = OBJECT[itemType];
  return (
    <div className={`${styles.object} ${styles[kind]} ${closing ? styles.closing : ""}`}>
      <div className={styles.objectHead}>
        <span className={styles.objectTitle}>{t(kind)}</span>
        {stamp}
      </div>
      <div className={styles.objectBody}>{children}</div>
      {variant === "completed" ? seal : <span data-bookmark className={styles.bookmark} aria-hidden />}
    </div>
  );
}
