import type { CSSProperties, ReactNode } from "react";
import styles from "./mini-shelf.module.css";

// Un tramo de la balda de la partida: tablero de madera con unos lomos. Lo que se
// pasa como children (la mascota) se sienta encima: el tramo es su bloque de
// posicionamiento. `landing` es el lomo que cae y se coloca (cierre de lectura).
export function MiniShelf({
  spines = [], landing = null, children, className = "",
}: {
  spines?: { color: string; h: number }[];
  landing?: { color: string } | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${styles.shelf} ${className}`}>
      <div className={styles.spines} aria-hidden>
        {spines.map((s, i) => (
          <i key={i} data-spine style={{ "--c": s.color, height: `${s.h}%` } as CSSProperties} />
        ))}
        {landing && <i data-landing className={styles.landing} style={{ "--c": landing.color } as CSSProperties} />}
      </div>
      <div className={styles.board} aria-hidden />
      {children}
    </div>
  );
}
