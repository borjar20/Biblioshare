"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import styles from "./bookmark-field.module.css";

// El libro de canto con su marcapáginas (spec 2026-11-07, «La sesión diaria»):
// arrastras la cinta, o tocas el canto, para fijar la página de hoy. Solo es
// presentación: quien escribe en `name="page"` es BookProgressField vía onChange.
//
// Puntero: el canto está en mitad de una hoja que se desplaza en vertical
// (`touch-action: pan-y`), así que tocarlo NO fija la página al bajar el dedo.
// Solo cuenta un arrastre horizontal (> DRAG_PX, y entonces la cinta sigue al
// dedo) o un toque sin movimiento al levantarlo. Un gesto vertical se abandona,
// y un `pointercancel` (el navegador se queda el gesto para hacer scroll) nunca
// escribe nada.
const DRAG_PX = 6;
const clamp01 = (f: number) => Math.min(1, Math.max(0, f));
export function bookmarkRange(fromPage: number | null, total: number | null): { min: number; max: number } {
  const min = Math.max(0, fromPage ?? 0);
  if (total && total > min) return { min, max: total };
  return { min, max: Math.max(min + 100, Math.ceil(min * 1.5)) };
}

export function pageFromFraction(frac: number, min: number, max: number): number {
  const f = Math.min(1, Math.max(0, frac));
  return Math.round(min + f * (max - min));
}

export function BookmarkField({
  fromPage, value, total, onChange,
}: {
  fromPage: number | null;
  value: number | null;
  total: number | null;
  onChange: (page: number) => void;
}) {
  const t = useTranslations("ritual.bookmark");
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; dragging: boolean } | null>(null);
  // Mientras arrastras, la cinta va pegada al dedo: sin la transición elástica.
  const [dragging, setDragging] = useState(false);
  const { min, max } = bookmarkRange(fromPage, total);
  const now = Math.min(max, Math.max(min, value ?? min));
  const span = Math.max(1, (total && total > 0 ? total : max));
  // Fracciones sin unidad (0–1): el CSS las multiplica por el ancho útil. Se
  // acotan: una posición guardada por encima del total no saca la cinta del canto.
  const readFrac = clamp01((fromPage ?? 0) / span);
  const markFrac = clamp01(now / span);
  const clamp = (p: number) => Math.min(max, Math.max(min, p));

  // La cinta recorre el tramo [min, max] del canto completo [0, span].
  function commitAt(clientX: number) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    onChange(clamp(pageFromFraction((clientX - r.left) / r.width, 0, span)));
  }
  function endGesture() {
    gesture.current = null;
    setDragging(false);
  }
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.dragging) {
      const dx = Math.abs(e.clientX - g.x);
      const dy = Math.abs(e.clientY - g.y);
      if (dy > DRAG_PX && dy > dx) { endGesture(); return; }
      if (dx <= DRAG_PX) return;
      g.dragging = true;
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    commitAt(e.clientX);
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    // Toque sin arrastre: fija la página donde se levantó el dedo.
    if (!g.dragging) commitAt(e.clientX);
    endGesture();
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    if (e.key in step) { e.preventDefault(); onChange(clamp(now + step[e.key])); }
    else if (e.key === "Home") { e.preventDefault(); onChange(min); }
    else if (e.key === "End") { e.preventDefault(); onChange(max); }
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t("label")}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-valuetext={t("valueText", { page: now, delta: Math.max(0, now - (fromPage ?? 0)) })}
      className={styles.book}
      style={{ "--read": readFrac, "--mark": markFrac } as CSSProperties}
      onKeyDown={onKeyDown}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={endGesture}
    >
      <span className={styles.pages} aria-hidden />
      <span className={styles.read} aria-hidden />
      <span className={styles.today} aria-hidden />
      <span className={styles.ribbon} aria-hidden />
    </div>
  );
}
