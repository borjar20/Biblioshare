"use client";
import { useState } from "react";
import styles from "./closing.module.css";

const FMT = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const VALID = /^\d{4}-\d{2}-\d{2}$/;

// Sello de tinta con la fecha de fin (spec 2026-11-07). El input de fecha nativo
// va encima, transparente y SIN controlar (si no, React borraría lo que se teclea
// a medias): tocar el sello abre el selector y el valor viaja en `name`. `value`
// guarda la última fecha válida; al salir con una fecha parcial o vacía se restaura.
export function InkDateStamp({ name, defaultValue, max, label }: { name: string; defaultValue: string; max: string; label: string }) {
  const [value, setValue] = useState(defaultValue);
  const shown = value ? FMT.format(new Date(`${value}T00:00:00Z`)).replace(".", "") : "—";
  return (
    <label className={styles.stamp}>
      <span aria-hidden className={styles.stampFace}>{shown}</span>
      <input type="date" name={name} max={max} defaultValue={defaultValue} aria-label={label}
        onChange={(e) => { if (VALID.test(e.target.value)) setValue(e.target.value); }}
        onBlur={(e) => { if (!VALID.test(e.currentTarget.value)) e.currentTarget.value = value; }}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch {} }}
        className={styles.stampInput} />
    </label>
  );
}
