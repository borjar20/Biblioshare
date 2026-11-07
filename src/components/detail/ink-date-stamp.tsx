"use client";
import { useState } from "react";
import styles from "./closing.module.css";

const FMT = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// Sello de tinta con la fecha de fin (spec 2026-11-07). El input de fecha nativo
// va encima, transparente: tocar el sello abre el selector y el valor viaja en `name`.
export function InkDateStamp({ name, defaultValue, max, label }: { name: string; defaultValue: string; max: string; label: string }) {
  const [value, setValue] = useState(defaultValue);
  const shown = value ? FMT.format(new Date(`${value}T00:00:00Z`)).replace(".", "") : "â€”";
  return (
    <label className={styles.stamp}>
      <span aria-hidden className={styles.stampFace}>{shown}</span>
      <input type="date" name={name} max={max} value={value} aria-label={label}
        onChange={(e) => {
          // Fecha parcial o vacía mientras se teclea: se conserva la última válida.
          if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setValue(e.target.value);
        }}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch {} }}
        className={styles.stampInput} />
    </label>
  );
}
