"use client";
import { memo, useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { IndexAtlasSaga } from "@/lib/sagas/index-atlas/model";
import { normalizeSearch } from "@/lib/sagas/index-atlas/params";
import styles from "./sagas-atlas.module.css";

// Buscador del atlas de /sagas (spec 2026-10-28 índice §3): combobox con lista de coincidencias.
// Es controlado: el texto vive en SagasAtlas, que también atenúa el plano con él. `memo`: con
// `onQuery`/`onPick` estables, un fotograma de cámara no lo vuelve a pintar.
const MAX_OPTIONS = 8;
export type IndexPick = { sagaId: string; childId: string | null };
type Option = IndexPick & { key: string; name: string; universe: string | null };

export const IndexSearch = memo(function IndexSearch({ sagas, query, onQuery, onPick }: {
  sagas: IndexAtlasSaga[]; query: string; onQuery: (q: string) => void; onPick: (target: IndexPick) => void;
}) {
  const t = useTranslations("sagaIndex.atlas.search");
  const listId = useId();
  const [active, setActive] = useState(0);
  const [closed, setClosed] = useState(false);
  const needle = normalizeSearch(query.trim());
  const options = useMemo<Option[]>(() => {
    if (!needle) return [];
    const out: Option[] = [];
    const hit = (name: string) => normalizeSearch(name).includes(needle);
    for (const s of sagas) {
      if (hit(s.name)) out.push({ key: s.id, sagaId: s.id, childId: null, name: s.name, universe: null });
      for (const c of s.children) {
        if (hit(c.name)) out.push({ key: `${s.id}/${c.id}`, sagaId: s.id, childId: c.id, name: c.name, universe: s.name });
      }
    }
    return out.slice(0, MAX_OPTIONS);
  }, [sagas, needle]);

  const open = needle !== "" && !closed;
  const current = Math.min(active, Math.max(options.length - 1, 0));
  const optionId = (i: number) => `${listId}-${i}`;
  function pick(o: Option) {
    onPick({ sagaId: o.sagaId, childId: o.childId });
    setClosed(true);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (options.length === 0) return;
      e.preventDefault();
      setClosed(false);
      setActive((current + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (e.key === "Enter") {
      if (open && options[current]) {
        e.preventDefault();
        pick(options[current]);
      }
    } else if (e.key === "Escape") {
      onQuery("");
      setClosed(false);
    }
  }

  return (
    <div className={styles.search}>
      <input
        type="search" role="combobox" className={styles.searchInput}
        aria-label={t("label")} placeholder={t("placeholder")} autoComplete="off"
        aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && options.length > 0 ? optionId(current) : undefined}
        value={query}
        onChange={(e) => { onQuery(e.target.value); setActive(0); setClosed(false); }}
        onFocus={() => setClosed(false)}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} role="listbox" aria-label={t("label")} className={styles.searchList} hidden={!open}>
        {options.map((o, i) => (
          <li key={o.key} id={optionId(i)} role="option" aria-selected={i === current} className={styles.searchOption}
            data-active={i === current || undefined}
            // mousedown: elige antes de que el input pierda el foco.
            onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
            <span>{o.name}</span>
            {o.universe && <small>{t("inUniverse", { name: o.universe })}</small>}
          </li>
        ))}
        {open && options.length === 0 && <li role="presentation" className={styles.searchEmpty}>{t("noMatches")}</li>}
      </ul>
    </div>
  );
});
