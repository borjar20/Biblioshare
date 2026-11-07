"use client";
import { useState } from "react";
import styles from "./closing.module.css";

const FMT = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// Sello de tinta con la fecha de fin (spec 2026-11-07). El input de fecha nativo
// va encima, transparente: tocar el sello abre el selector y el valor viaja en `name`.
export function InkDateStamp({ name, defaultValue, max, label }: { name: string; defaultValue: string; max: string; label: string }) {
  const [value, setValue] = useState(defaultValue);
  const shown = value ? FMT.format(new Date(`${value}T00:00:00Z`)).replace(".", "") : "—";
  return (
    <label className={styles.stamp}>
      <span aria-hidden className={styles.stampFace}>{shown}</span>
      <input type="date" name={name} max={max} value={value} aria-label={label}
        onChange={(e) => setValue(e.target.value)} className={styles.stampInput} />
    </label>
  );
}
