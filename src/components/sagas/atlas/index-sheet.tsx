"use client";
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Viewport } from "@/lib/atlas/types";
import { cardPosition, type Insets } from "@/lib/atlas/visible-camera";
import { useDismissable } from "@/components/atlas/use-dismissable";
import { sagaAtlasHref } from "@/lib/catalog/item-href";
import type { IndexAtlasSaga } from "@/lib/sagas/index-atlas/model";
import styles from "./sagas-atlas.module.css";

/** Centro de la saga en pantalla y su medio ancho y medio alto ya escalados. */
export type SheetAnchor = { x: number; y: number; halfW: number; halfH: number };

/** Sagas y cromo del atlas (barra, dock, zoom): tocarlos no cierra la ficha (el clic que sigue
 *  en otra saga la cambia sin parpadeo; el cromo se usa con la ficha abierta). Estable. */
const keepOpen = (target: Element) => target.closest("[data-saga-id], [data-atlas-chrome]") !== null;
/** Tamaño supuesto hasta medir la tarjeta (y en jsdom, que no mide). */
const CARD_GUESS = { width: 280, height: 200 };
const bold = (chunks: ReactNode) => <b>{chunks}</b>;

/**
 * Mini-ficha de una saga o universo (spec 2026-10-28 índice §5.2). Una sola pieza de DOM, como
 * la de obras del atlas de la saga: a ≥ 640 px es una tarjeta flotante junto a la saga
 * (`cardPosition`); por debajo, hoja inferior con fondo. Seguir es optimista y lo decide quien
 * la monta (`pending`/`error` llegan de fuera). Escape y ✕ devuelven el foco a la saga.
 */
export function IndexSheet({ saga, authenticated, anchor, viewport, insets, pending, error, onFollow, onChild, onClose }: {
  saga: IndexAtlasSaga; authenticated: boolean; anchor: SheetAnchor | null; viewport: Viewport; insets: Insets;
  pending: boolean; error: boolean;
  onFollow: (follow: boolean) => void; onChild: (childId: string) => void; onClose: (refocus: boolean) => void;
}) {
  const t = useTranslations("sagaIndex");
  const wrapRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [size, setSize] = useState(CARD_GUESS);

  // Medida al montar y con cada cambio de tamaño: el alto cambia al cambiar de saga o al errar.
  useLayoutEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const measure = () => {
      if (!el.offsetWidth) return;
      const next = { width: el.offsetWidth, height: el.offsetHeight };
      setSize((s) => (s.width === next.width && s.height === next.height ? s : next));
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // El foco entra en la ficha al abrirla y al cambiar de saga.
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, [saga.id]);
  const onBlur = useDismissable({ open: true, ref: wrapRef, close: onClose, ignore: keepOpen });

  const pos = anchor ? cardPosition(anchor, viewport, insets, size) : null;
  const style = pos ? ({ "--x": `${pos.left}px`, "--y": `${pos.top}px` } as CSSProperties) : undefined;
  const isUniverse = saga.children.length > 0;
  const breakdown = (["book", "movie", "series"] as const)
    .filter((k) => saga.typeBreakdown[k] > 0)
    .map((k) => t(`typeCount.${k}`, { count: saga.typeBreakdown[k] }))
    .join(" · ");
  const eyebrow = isUniverse ? t("atlas.sheet.universeEyebrow", { count: saga.children.length + 1 }) : breakdown;
  const progress = saga.progress && saga.progress.total > 0 ? saga.progress : null;

  return (
    <div ref={wrapRef} onBlur={onBlur}>
      {/* Móvil: el fondo se lleva el toque (con un clic, no un pointerdown: si no, el clic caería en la saga de debajo). */}
      <div className={styles.sheetBackdrop} aria-hidden="true" onClick={() => onClose(false)} />
      <div ref={dialogRef} role="dialog" aria-labelledby={titleId} tabIndex={-1} className={styles.sheet}
        data-side={pos?.side} style={style}>
        <div className={styles.shHead}>
          <div className={styles.shHeading}>
            {eyebrow && <p className={styles.shEyebrow}>{eyebrow}</p>}
            <h2 id={titleId} className={styles.shTitle}>{saga.name}</h2>
            {saga.creator && <p className={styles.shMeta}>{saga.creator}</p>}
          </div>
          <button type="button" className={styles.shClose} aria-label={t("atlas.sheet.close")} onClick={() => onClose(true)}>✕</button>
        </div>
        {progress && (
          <div className={styles.shProgress}>
            <span>{t.rich("atlas.sheet.progress", { completed: progress.completed, total: progress.total, b: bold })}</span>
            <span className={styles.shBar} aria-hidden="true">
              <i style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }} />
            </span>
          </div>
        )}
        <div className={styles.shActions}>
          <Link href={saga.href} className={styles.shPrimary}>{t("atlas.sheet.open")}</Link>
          <Link href={sagaAtlasHref(saga.id)} className={styles.shGhost}>{t("atlas.sheet.atlas")}</Link>
          {authenticated ? (
            <button type="button" className={styles.shGhost} aria-pressed={saga.isFollowed} disabled={pending}
              onClick={() => onFollow(!saga.isFollowed)}>
              {saga.isFollowed ? t("atlas.sheet.following") : t("atlas.sheet.follow")}
            </button>
          ) : (
            <Link href="/login?next=%2Fsagas" className={styles.shGhost}>{t("atlas.sheet.loginToFollow")}</Link>
          )}
        </div>
        {error && <p role="alert" className={styles.shError}>{t("atlas.sheet.followError")}</p>}
        {isUniverse && (
          <div className={styles.shChildren}>
            <p className={styles.shChildrenTitle}>{t("atlas.sheet.children")}</p>
            <ul className={styles.shChildList}>
              {saga.children.map((c) => (
                <li key={c.id} className={styles.shChild}>
                  <a href={c.href} className={styles.shChildLink}>
                    {c.name}<span>{t("atlas.sheet.titleCount", { count: c.titleCount })}</span>
                  </a>
                  <button type="button" className={styles.shMap} aria-label={t("atlas.sheet.showInMap", { name: c.name })}
                    onClick={() => onChild(c.id)}>◎</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
