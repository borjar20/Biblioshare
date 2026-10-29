"use client";
import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { useTranslations } from "next-intl";
import styles from "./sagas-atlas.module.css";

// Cromo del atlas de /sagas (spec 2026-10-28 índice §5): barra superior y zoom. Sin estado:
// todo llega de SagasAtlas (buscador y «Nueva saga» entran por `actions`).

// `ref` en la barra: la cámara mide lo que tapa (useChromeInsets).
export function IndexTopBar({ count, summary, actions, ref }: {
  count: number; summary: ReactNode;
  actions?: ReactNode; // a la derecha: buscador y acciones
  ref?: Ref<HTMLElement>;
}) {
  const t = useTranslations("sagaIndex");
  return (
    <header ref={ref} className={styles.top} data-atlas-chrome="top">
      <Link href="/" aria-label={t("atlas.back")} className={styles.back}>‹</Link>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>{t("atlas.eyebrow", { count })}</p>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.summary} aria-live="polite">{summary}</p>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

export function IndexZoom({ onZoomIn, onZoomOut, onFit }: { onZoomIn: () => void; onZoomOut: () => void; onFit: () => void }) {
  const t = useTranslations("sagaIndex.atlas");
  return (
    <div className={styles.zoom} data-atlas-chrome="zoom">
      <button type="button" aria-label={t("zoomIn")} onClick={onZoomIn}>+</button>
      <button type="button" aria-label={t("zoomOut")} onClick={onZoomOut}>−</button>
      <button type="button" aria-label={t("fit")} onClick={onFit}>⤢</button>
    </div>
  );
}
