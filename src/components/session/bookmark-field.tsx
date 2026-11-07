"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import styles from "./bookmark-field.module.css";

// El libro de canto con su marcapáginas (spec 2026-11-07, «La sesión diaria»):
// arrastras la cinta, o tocas el canto, para fijar la página de hoy. Solo es
// presentación: quien escribe en `name="page"` es BookProgressField vía onChange.
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
  const dragging = useRef(false);
  const { min, max } = bookmarkRange(fromPage, total);
  const now = Math.min(max, Math.max(min, value ?? min));
  const span = Math.max(1, (total && total > 0 ? total : max));
  // Fracciones sin unidad (0–1): el CSS las multiplica por el ancho útil.
  const readFrac = (fromPage ?? 0) / span;
  const markFrac = now / span;
  const clamp = (p: number) => Math.min(max, Math.max(min, p));

  function fromPointer(e: PointerEvent<HTMLDivElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    // La cinta recorre el tramo [min, max] del canto completo [0, span].
    const page = Math.round(((e.clientX - r.left) / r.width) * span);
    onChange(clamp(page));
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
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); fromPointer(e); }}
      onPointerMove={(e) => { if (dragging.current) fromPointer(e); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      <span className={styles.pages} aria-hidden />
      <span className={styles.read} aria-hidden />
      <span className={styles.today} aria-hidden />
      <span className={styles.ribbon} aria-hidden />
    </div>
  );
}
