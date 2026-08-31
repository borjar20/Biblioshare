"use client";

import styles from "./stage.module.css";
import { DieShape } from "./die-shape";
import { useLandingGate } from "./use-landing-gate";

const VISIBLE_MAX = 8;

// Tamaño por dados visibles: uno protagonista, muchos compactos.
function dieSize(n: number): number {
  if (n <= 1) return 96;
  if (n === 2) return 80;
  if (n <= 4) return 64;
  return 48;
}

/**
 * Dados SVG que giran a la vez (stagger 60 ms) y aterrizan cada uno en su
 * resultado (teatro determinista: la tirada ya está emitida). En reposo
 * enseña la config del stepper con «?» y el hint que centra el escenario.
 * Más de VISIBLE_MAX resultados (logs antiguos): giran 8 y el desglose y el
 * total mandan.
 */
export function DiceStage({
  roll,
  idleSides,
  idleCount,
  onRoll,
  label,
  hint,
}: {
  roll: { id: string; sides: number; results: number[] } | null;
  idleSides: number;
  idleCount: number;
  onRoll: () => void;
  label: string;
  hint: string;
}) {
  const visible = Math.min(roll ? roll.results.length : idleCount, VISIBLE_MAX);
  const { landed, reduced, onOneEnd } = useLandingGate(roll?.id ?? null, visible);
  const sides = roll ? roll.sides : idleSides;
  const size = dieSize(visible);

  return (
    <div className={styles.stage}>
      <button type="button" aria-label={label} onClick={onRoll} className={styles.objectButton}>
        <span className={styles.diceRow}>
          {Array.from({ length: visible }, (_, i) => (
            <span
              key={`${roll?.id ?? "idle"}-${i}`}
              className={roll && !reduced ? `${styles.dieWrap} ${styles.dieSpin}` : styles.dieWrap}
              style={{ width: size, height: size, animationDelay: `${i * 60}ms` }}
              onAnimationEnd={onOneEnd}
            >
              <DieShape sides={sides} value={landed && roll ? String(roll.results[i]) : "?"} size={size} />
            </span>
          ))}
        </span>
      </button>
      <div aria-live="polite" className={`${styles.resultZone} text-center`}>
        {landed && roll ? (
          <div className={styles.pop} data-testid="dice-result">
            <p className="font-serif text-[40px] font-semibold leading-none">
              {roll.results.reduce((a, b) => a + b, 0)}
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {roll.results.length}d{roll.sides}
            </p>
            {roll.results.length > 1 ? (
              <p className="mt-0.5 text-[14px] text-muted-foreground">{roll.results.join(" + ")}</p>
            ) : null}
          </div>
        ) : !roll ? (
          <p className="text-[14px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
