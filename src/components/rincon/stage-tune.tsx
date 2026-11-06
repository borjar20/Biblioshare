"use client";

import { useTranslations } from "next-intl";
import {
  ALL_BUCKETS, antojosFor, eligibleItems, TYPE_ACCENT,
  type Antojo, type SorteoCollection, type SorteoItem, type SorteoSettings, type TimeBucket, type TypeFilter,
} from "./sorteo-logic";
import styles from "./sorteo-stage.module.css";

const TYPE_ORDER: TypeFilter[] = ["all", "book", "movie", "series"];

// Nombre visible de un antojo; lo comparten el panel y la píldora de SorteoStage.
export function useAntojoLabel(type: TypeFilter) {
  const t = useTranslations("sorteo");
  return (a: Antojo) => {
    if (a.collectionName) return a.collectionName;
    if (a.id === "quick") return t(`antojo.quick.${type}`);
    if (a.id === "fresh") return t(`antojo.fresh.${type}`);
    return t(`antojo.${a.id}`);
  };
}

// Panel «Afinar la tirada» (spec «Controles»): opcional, se superpone desde abajo.
// Cada cambio llega al padre, que atenúa la balda en vivo.
export function StageTune({
  open, pool, collections, settings, onChange, onDone,
}: {
  open: boolean;
  pool: SorteoItem[];
  collections: SorteoCollection[];
  settings: SorteoSettings;
  onChange: (s: SorteoSettings) => void;
  onDone: () => void;
}) {
  const t = useTranslations("sorteo");
  const list = antojosFor(settings.type, collections);
  const label = useAntojoLabel(settings.type);
  const desc = (a: Antojo) => {
    if (a.collectionName) return t("antojo.collectionDesc");
    if (a.id === "any") return t(`antojo.anyDesc.${settings.type}`);
    if (a.id === "quick") return t(`antojo.quickDesc.${settings.type}`);
    return t(`antojo.${a.id}Desc`);
  };
  const toggleBucket = (b: TimeBucket) => {
    const has = settings.buckets.includes(b);
    if (has && settings.buckets.length === 1) return; // siempre queda al menos uno
    onChange({ ...settings, buckets: has ? settings.buckets.filter((x) => x !== b) : [...settings.buckets, b] });
  };

  return (
    <div className={`${styles.tune} ${open ? styles.on : ""}`} aria-hidden={!open} role="group" aria-label={t("tuneTitle")}>
      <div className={styles["tune-head"]}>
        <h3>{t("tuneTitle")}</h3>
        <button type="button" className={styles.cta} onClick={onDone}>{t("tuneDone")}</button>
      </div>
      <div className={styles.types} role="group" aria-label={t("tuneTypesLabel")}>
        {TYPE_ORDER.map((type) => (
          <button key={type} type="button" className={styles.chip} aria-pressed={settings.type === type}
            onClick={() => onChange({ ...settings, type, antojo: "any" })}>
            {type !== "all" && <span className={styles.dot} style={{ background: TYPE_ACCENT[type] }} />}
            {t(`types.${type}`)}
          </button>
        ))}
      </div>
      <div className={styles.antojos}>
        {list.map((a) => {
          const n = eligibleItems(pool, settings, a.id).length;
          return (
            <button key={a.id} type="button" className={styles.antojo} aria-pressed={settings.antojo === a.id}
              disabled={n === 0} onClick={() => onChange({ ...settings, antojo: a.id })}>
              <span className={styles.ic} aria-hidden>{a.icon}</span>
              <b>{label(a)}</b>
              <small>{n > 0 ? desc(a) : t("antojo.empty")}</small>
              <span className={styles.n}>
                {t("antojo.count", { count: n })}
                {settings.antojo === a.id && ` ${t("antojo.chosen")}`}
              </span>
            </button>
          );
        })}
      </div>
      <p className={styles.tlabel}>{t("tuneTimeLabel")}</p>
      <div className={styles.trow}>
        {ALL_BUCKETS.map((b) => (
          <button key={b} type="button" className={styles.tchk} aria-pressed={settings.buckets.includes(b)}
            onClick={() => toggleBucket(b)}>{t(`buckets.${b}`)}</button>
        ))}
      </div>
      <div className={styles.sumrow}>
        <span>{t("tuneSummary", { count: eligibleItems(pool, settings).length, total: pool.length })}</span>
        <button type="button" className={styles.ghost}
          onClick={() => onChange({ type: "all", antojo: "any", buckets: ALL_BUCKETS })}>{t("tuneReset")}</button>
      </div>
    </div>
  );
}
