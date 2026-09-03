"use client";

import styles from "./stage.module.css";
import { buzz, stableColor } from "./stage-helpers";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";

function BagSvg() {
  return (
    <svg viewBox="0 0 120 130" width="110" height="120" aria-hidden="true">
      <path
        d="M38 34 Q28 22 40 16 Q60 6 80 16 Q92 22 82 34"
        fill="none"
        stroke="var(--foreground-soft)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M36 36 Q18 62 22 92 Q26 122 60 124 Q94 122 98 92 Q102 62 84 36 Q60 44 36 36 Z"
        fill="var(--surface-3)"
        stroke="var(--foreground-soft)"
        strokeWidth="4"
      />
      <path d="M36 36 Q60 48 84 36" fill="none" stroke="var(--foreground-soft)" strokeWidth="3" />
      <circle cx="46" cy="40" r="3.5" fill="var(--foreground-soft)" />
      <circle cx="74" cy="40" r="3.5" fill="var(--foreground-soft)" />
    </svg>
  );
}

/**
 * Bolsa que se sacude al tocarla y suelta la ficha con rebote (la sacudida
 * dura 500 ms; la ficha entra con esos 500 ms de delay — coreografía en CSS,
 * ver .tokenPop). El resultado ya está emitido: puro teatro.
 */
export function BagStage({
  drawn,
  onDraw,
  label,
  disabled,
  hint,
}: {
  drawn: { id: string; name: string } | null;
  onDraw: () => void;
  label: string;
  disabled: boolean;
  hint: string;
}) {
  const reduced = useReducedMotion();

  return (
    <div className={styles.stage}>
      <button
        type="button"
        aria-label={label}
        onClick={onDraw}
        disabled={disabled}
        className={styles.objectButton}
      >
        <span
          key={drawn?.id ?? "idle"}
          className={drawn && !reduced ? styles.bagShake : undefined}
          style={{ display: "block" }}
        >
          <BagSvg />
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {drawn ? (
          <span
            key={drawn.id}
            className={`${styles.token} ${reduced ? "" : styles.tokenPop} font-serif text-[20px]`}
            style={{ background: stableColor(drawn.name) }}
            onAnimationEnd={buzz}
          >
            <span data-testid="bag-result">{drawn.name}</span>
          </span>
        ) : (
          <p className="text-[14px] text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}

/** Pila de circulitos por tipo: hasta 8 puntos, más allá «×N». Count 0 = ×0 apagado. */
export function TokenPile({ name, count }: { name: string; count: number }) {
  if (count === 0) return <span className="text-muted-foreground">×0</span>;
  return (
    // role="img": aria-label sobre un span genérico lo ignoran muchos lectores
    // de pantalla — con img el recuento «×N» vuelve a anunciarse (review final).
    <span className={styles.pile} role="img" aria-label={`×${count}`}>
      {Array.from({ length: Math.min(count, 8) }, (_, i) => (
        <span key={i} className={styles.pileDot} style={{ background: stableColor(name) }} />
      ))}
      {count > 8 ? <span className="text-[12px] text-muted-foreground" aria-hidden="true">×{count}</span> : null}
    </span>
  );
}
