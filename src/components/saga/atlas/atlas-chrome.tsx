"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { sagaHref } from "@/lib/catalog/item-href";
import type { Lens } from "@/lib/sagas/atlas/layout";
import styles from "./atlas.module.css";

// Cromo del atlas (spec 2026-10-28 §6): barra superior, dock de lentes y zoom.
// Sin estado: todo llega de SagaAtlas.

/** Nombre de cada lente: lo comparten el dock y el `aria-label` del lienzo. */
export const LENS_LABEL = { orden: "atlas.lensOrden", rol: "atlas.lensRol", publicacion: "atlas.lensPublicacion" } as const;
const LENS_LEGEND = { orden: "atlas.legendOrden", rol: "atlas.legendRol", publicacion: "atlas.legendPublicacion" } as const;
export const LENSES: readonly Lens[] = ["orden", "rol", "publicacion"];
const LENS_ICON: Record<Lens, ReactNode> = {
  orden: <><path d="M1 8h14" /><rect x="2" y="5" width="3" height="6" rx="1" /><rect x="6.5" y="5" width="3" height="6" rx="1" /><rect x="11" y="5" width="3" height="6" rx="1" /></>,
  rol: <><path d="M1 3h14M1 8h14M1 13h14" /><circle cx="5" cy="3" r="1.4" fill="currentColor" /><circle cx="9" cy="8" r="1.4" fill="currentColor" /><circle cx="12" cy="13" r="1.4" fill="currentColor" /></>,
  publicacion: <><path d="M1 12h14" /><path d="M3 10v4M8 10v4M13 10v4" /><path d="M3 7 8 3l5 4" /></>,
};

export function AtlasTopBar({ sagaId, sagaName, workCount, summary }: {
  sagaId: string; sagaName: string; workCount: number; summary: ReactNode;
}) {
  const t = useTranslations("saga");
  return (
    <header className={styles.top}>
      <Link href={sagaHref(sagaId)} aria-label={t("atlas.back")} className={styles.back}>‹</Link>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>{t("atlas.eyebrow", { count: workCount })}</p>
        <h1 className={styles.title}>{sagaName}</h1>
        <p className={styles.summary} aria-live="polite">{summary}</p>
      </div>
    </header>
  );
}

export function AtlasDock({ lens, onLens }: { lens: Lens; onLens: (lens: Lens) => void }) {
  const t = useTranslations("saga");
  return (
    <div className={styles.dock}>
      <div className={styles.lens} role="group" aria-label={t("atlas.lensGroup")}>
        {LENSES.map((l) => (
          <button key={l} type="button" aria-pressed={l === lens} aria-label={t(LENS_LABEL[l])} onClick={() => onLens(l)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{LENS_ICON[l]}</svg>
            <span aria-hidden="true">{t(LENS_LABEL[l])}</span>
          </button>
        ))}
      </div>
      <p className={styles.legend}>{t(LENS_LEGEND[lens])}</p>
    </div>
  );
}

export function AtlasZoom({ onZoomIn, onZoomOut, onFit }: { onZoomIn: () => void; onZoomOut: () => void; onFit: () => void }) {
  const t = useTranslations("saga.atlas");
  return (
    <div className={styles.zoom}>
      <button type="button" aria-label={t("zoomIn")} onClick={onZoomIn}>+</button>
      <button type="button" aria-label={t("zoomOut")} onClick={onZoomOut}>−</button>
      <button type="button" aria-label={t("fit")} onClick={onFit}>⤢</button>
    </div>
  );
}
