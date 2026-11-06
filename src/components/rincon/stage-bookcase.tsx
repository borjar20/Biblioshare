"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { initials, itemKey, seasonsLabel, spineHeight, spineShade, spineWidth, type SorteoItem } from "./sorteo-logic";
import styles from "./sorteo-stage.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// El mueble (spec «Estantería»): dos baldas con todos los pendientes (hasta 24),
// atrezo, y el foco que sigue al lomo `tickKey` durante la tirada.
export function StageBookcase({
  items, offKeys, tickKey, pulledKeys, takenKeys, lit, dim, shakeSeq, choosing, children,
}: {
  items: SorteoItem[];
  offKeys: ReadonlySet<string>;
  tickKey: string | null;
  pulledKeys: ReadonlySet<string>;
  takenKeys: ReadonlySet<string>;
  lit: boolean;
  dim: boolean;
  shakeSeq: number;
  choosing: boolean;
  children: ReactNode; // la mascota y su bocadillo, sentados encima
}) {
  const caseRef = useRef<HTMLDivElement>(null);

  // El foco se coloca sobre el lomo en tick, medido en el propio mueble.
  useLayoutEffect(() => {
    const box = caseRef.current;
    if (!box || !tickKey) return;
    const spine = box.querySelector<HTMLElement>(`[data-key="${CSS.escape(tickKey)}"]`);
    if (!spine) return;
    const c = box.getBoundingClientRect();
    const r = spine.getBoundingClientRect();
    box.style.setProperty("--sx", `${r.left - c.left + r.width / 2}px`);
    box.style.setProperty("--sy", `${r.top - c.top + r.height / 2}px`);
  }, [tickKey]);

  // Reinicia la animación de temblor en cada tirada.
  useEffect(() => {
    const box = caseRef.current;
    if (!box || shakeSeq === 0) return;
    box.classList.remove(styles.shake);
    void box.offsetWidth;
    box.classList.add(styles.shake);
  }, [shakeSeq]);

  const half = Math.ceil(items.length / 2);
  const rows = [items.slice(0, half), items.slice(half)];
  const spine = (item: SorteoItem, lean: boolean) => {
    const k = itemKey(item);
    const style = { "--w": `${spineWidth(item)}px`, "--h": `${spineHeight(item.itemId)}%`, "--c": spineShade(item) } as CSSProperties;
    return (
      <div
        key={k}
        data-key={k}
        title={item.title}
        aria-hidden
        style={style}
        className={cx(styles.bk, styles[item.itemType], lean && styles.lean, offKeys.has(k) && styles.off,
          tickKey === k && styles.tick, pulledKeys.has(k) && styles.pulled, takenKeys.has(k) && styles.taken)}
      >
        {item.itemType === "book" && (<><i className={styles.band} /><i className={styles.band} /></>)}
        {item.itemType === "movie" && <span className={styles.cap}>▶</span>}
        <span className={styles.tt}>{item.title}</span>
        {item.itemType === "book" && <i className={styles.band} />}
        <span className={styles.au}>
          {item.itemType === "series" ? seasonsLabel(item) : initials(item.subtitle ?? item.title)}
        </span>
      </div>
    );
  };

  return (
    <div ref={caseRef} className={cx(styles.case, dim && styles.dim, lit && styles.lit)}>
      <div className={styles.spot} aria-hidden />
      {children}
      <div className={cx(styles.rows, choosing && styles.choosing)}>
        <div className={styles.row}>
          {rows[0].map((i) => spine(i, false))}
          <div className={cx(styles.dc, styles.bookend)} aria-hidden />
          <span className={styles.spacer} />
          <div className={cx(styles.dc, styles.plant)} aria-hidden>
            <i className={styles.lf} /><i className={styles.lf} /><i className={styles.lf} /><b className={styles.pot} />
          </div>
        </div>
        <div className={styles.lip} />
        <div className={styles.row}>
          <div className={cx(styles.dc, styles.flat)} aria-hidden><i /><i /><i /></div>
          {rows[1].map((i, k) => spine(i, k === rows[1].length - 1))}
          <span className={styles.spacer} />
        </div>
        <div className={styles.lip} />
      </div>
    </div>
  );
}
