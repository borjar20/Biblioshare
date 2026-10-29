"use client";
import { memo } from "react";
import { useTranslations } from "next-intl";
import { NO_FILTERS, hasFilters, type IndexFilters as Filters, type IndexType } from "@/lib/sagas/index-atlas/params";
import styles from "./sagas-atlas.module.css";

// Filtros del atlas de /sagas (§3): botones conmutables que atenúan lo que no cumple, sin ocultarlo.
// «En tu colección» solo con sesión (sin ella nadie tiene colección).
const TYPES: readonly IndexType[] = ["libro", "pelicula", "serie"];
const FLAGS = ["itinerarios", "coleccion", "min5"] as const;

export const IndexFilters = memo(function IndexFilters({ filters, authenticated, onChange }: {
  filters: Filters; authenticated: boolean; onChange: (f: Filters) => void;
}) {
  const t = useTranslations("sagaIndex.atlas.filters");
  const toggleType = (k: IndexType) =>
    onChange({ ...filters, tipos: filters.tipos.includes(k) ? filters.tipos.filter((x) => x !== k) : [...filters.tipos, k] });
  return (
    <div role="group" aria-label={t("label")} className={styles.filters}>
      {TYPES.map((k) => (
        <button key={k} type="button" aria-pressed={filters.tipos.includes(k)} onClick={() => toggleType(k)}>{t(k)}</button>
      ))}
      {FLAGS.filter((k) => authenticated || k !== "coleccion").map((k) => (
        <button key={k} type="button" aria-pressed={filters[k]} onClick={() => onChange({ ...filters, [k]: !filters[k] })}>{t(k)}</button>
      ))}
      {hasFilters(filters) && (
        <button type="button" className={styles.clear} onClick={() => onChange(NO_FILTERS)}>{t("clear")}</button>
      )}
    </div>
  );
});
