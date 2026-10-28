"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import type { Viewport } from "@/lib/atlas/types";
import { SAGA_ACCENT, type SagaAccentToken } from "@/lib/sagas/accents";
import type { AtlasWork } from "@/lib/sagas/atlas/model";
import { cardPosition, type Insets } from "@/lib/sagas/atlas/visible-camera";
import { SkipOptionalButton } from "./skip-optional-button";
import { useDismissable } from "./use-dismissable";
import { useWorkFacts } from "./work-facts";
import styles from "./atlas.module.css";

/** Centro de la obra en pantalla y su medio ancho y medio alto ya escalados. */
export type WorkAnchor = { x: number; y: number; halfW: number; halfH: number };

/** Obras y cromo del atlas (barra, dock, zoom): tocarlos o enfocarlos no cierra la ficha
 *  (el clic que sigue en una obra la cambia, sin parpadeo; el cromo se usa con la ficha abierta). */
const keepOpen = (target: Element) => target.closest("[data-work-key], [data-atlas-chrome]") !== null;
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
/** Tamaño supuesto hasta medir la tarjeta (y en jsdom, que no mide). */
const CARD_GUESS = { width: 300, height: 220 };

/**
 * Mini-ficha de una obra (spec 2026-10-28 §7). Una sola pieza de DOM, como la hoja de
 * itinerarios: a ≥ 640 px es una tarjeta flotante junto a la obra (`cardPosition`, que la
 * mantiene en la zona libre y le da la vuelta si no cabe); por debajo, hoja inferior con
 * fondo. Se cierra con Escape y ✕ (el foco vuelve a la obra) o al tocar el lienzo vacío.
 */
export function WorkSheet({ sagaId, work, works, accent, authenticated, progress, anchor, viewport, insets, onClose }: {
  sagaId: string;
  work: AtlasWork;
  works: readonly AtlasWork[];
  accent: SagaAccentToken;
  authenticated: boolean;
  progress: boolean; // capa Progreso: solo entonces se afirma el estado del lector
  anchor: WorkAnchor | null;
  viewport: Viewport;
  insets: Insets;
  onClose: (refocus: boolean) => void;
}) {
  const t = useTranslations("saga");
  const facts = useWorkFacts(works)(work);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [size, setSize] = useState(CARD_GUESS);

  // Medida al montar y con cada cambio de tamaño: el alto cambia al cambiar de obra o al saltarla.
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
  // El foco entra en la ficha al abrirla y al cambiar de obra.
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, [work.key]);
  const onBlur = useDismissable({ open: true, ref: wrapRef, close: onClose, ignore: keepOpen, blur: "always" });

  // Tab que se saldría de la ficha: se cierra y el foco vuelve a la obra que la abrió, para que
  // el siguiente Tab siga el orden de lectura (la ficha está al final del DOM, tras el plano).
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
    const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const active = document.activeElement;
    const leaving = e.shiftKey
      ? items.length === 0 || active === dialogRef.current || active === items[0]
      : items.length === 0 || active === items[items.length - 1];
    if (leaving) onClose(true); // sin preventDefault: el Tab sigue desde la obra
  }

  const pos = anchor ? cardPosition(anchor, viewport, insets, size) : null;
  const style = pos ? ({ "--x": `${pos.left}px`, "--y": `${pos.top}px` } as CSSProperties) : undefined;
  const meta = [work.readingNo !== null ? `#${work.readingNo}` : null, progress ? facts.state : null].filter(Boolean).join(" · ");

  return (
    <div ref={wrapRef} onBlur={onBlur} onKeyDown={onKeyDown}>
      {/* Móvil: el fondo se lleva el toque (con un clic, no un pointerdown: si no, el clic caería en la obra de debajo). */}
      <div className={styles.sheetBackdrop} aria-hidden="true" onClick={() => onClose(false)} />
      <div ref={dialogRef} role="dialog" aria-labelledby={titleId} tabIndex={-1} className={styles.workSheet}
        data-side={pos?.side} style={style}>
        <div className={styles.wsHead}>
          <span className={styles.wsCover}>
            {work.coverUrl ? (
              <Image src={work.coverUrl} alt="" fill sizes="56px" />
            ) : (
              <span className={styles.spine} style={{ background: SAGA_ACCENT[accent].cssVar }} aria-hidden="true">{work.title}</span>
            )}
          </span>
          <div className={styles.wsHeading}>
            <h2 id={titleId} className={styles.wsTitle}>{work.title}</h2>
            {meta && <p className={styles.wsMeta}>{meta}</p>}
            {facts.role && (
              <span className={styles.wsRole}><span aria-hidden="true">{facts.role.glyph}</span> {facts.role.label}</span>
            )}
          </div>
          <button type="button" className={styles.wsClose} aria-label={t("atlas.close")} onClick={() => onClose(true)}>✕</button>
        </div>
        {(facts.window || facts.fitsNow || facts.tandem || facts.step) && (
          <ul className={styles.wsFacts}>
            {facts.window && <li>{facts.window}</li>}
            {facts.fitsNow && <li className={styles.wsFits}>{facts.fitsNow}</li>}
            {facts.tandem && (
              <li>{facts.tandem}{facts.tandemNote && <> · <em>{facts.tandemNote}</em></>}</li>
            )}
            {facts.step && (
              <li>{facts.step}{facts.stepNote && <> · <em>{facts.stepNote}</em></>}</li>
            )}
          </ul>
        )}
        <div className={styles.wsActions}>
          <Link href={work.href} className={styles.wsOpen}>{t("atlas.open")}</Link>
          {authenticated && work.optional && <SkipOptionalButton sagaId={sagaId} work={work} />}
        </div>
      </div>
    </div>
  );
}
