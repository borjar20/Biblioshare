"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { RatingDots } from "@/components/ui/rating-dots";
import styles from "./closing.module.css";

// La nota como lacre (spec 2026-11-07): piel nueva sobre RatingDots (misma escala
// 1–10 con medios y su accesibilidad). Cada nota nueva reestampa el lacre.
// RatingDots no emite input propio: el `name="rating"` oculto vive aquí (uno solo).
export function WaxSeal({ value, onChange, itemType }: { value: number | null; onChange: (v: number) => void; itemType: ItemType }) {
  const t = useTranslations("ritual.closing");
  const [stamp, setStamp] = useState(0);
  return (
    <div className={styles.sealRow}>
      <span key={stamp} className={`${styles.wax} ${value !== null ? styles.waxSet : ""}`} aria-hidden>
        {value ?? ""}
      </span>
      <div className={styles.sealDots}>
        <span className={styles.sealLabel}>{value === null ? t("sealEmpty") : t("sealLabel")}</span>
        <RatingDots value={value} onChange={(v) => { onChange(v); setStamp((n) => n + 1); }} itemType={itemType} size="lg" />
      </div>
      <input type="hidden" name="rating" value={value ?? ""} />
    </div>
  );
}
