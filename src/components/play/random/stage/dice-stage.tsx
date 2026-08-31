"use client";

import { useState } from "react";
import styles from "./stage.module.css";
import { buzz } from "./stage-helpers";
import { DieShape } from "./die-shape";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * Dado SVG que gira al tirar y aterriza mostrando el primer resultado (teatro
 * determinista: el resultado ya está emitido). La silueta refleja el dado en
 * juego: la tirada actual o, en reposo, la config de los inputs. Con N>1, al
 * aterrizar aparecen mini-dados escalonados y el texto completo con el total.
 */
export function DiceStage({
  roll,
  idleSides,
  resultText,
  onRoll,
  label,
}: {
  roll: { id: string; sides: number; results: number[] } | null;
  idleSides: number;
  resultText: string | null;
  onRoll: () => void;
  label: string;
}) {
  const reduced = useReducedMotion();
  const [landedId, setLandedId] = useState<string | null>(null);
  const landed = roll !== null && (reduced || landedId === roll.id);

  const sides = roll ? roll.sides : idleSides;
  const value = landed && roll ? String(roll.results[0]) : "?";

  return (
    <div className={styles.stage}>
      <button type="button" aria-label={label} onClick={onRoll} className={styles.objectButton}>
        <span
          key={roll?.id ?? "idle"}
          className={roll && !reduced ? `${styles.dieWrap} ${styles.dieSpin}` : styles.dieWrap}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && roll) {
              setLandedId(roll.id);
              buzz();
            }
          }}
        >
          <DieShape sides={sides} value={value} size={96} />
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {landed && roll ? (
          <>
            {roll.results.length > 1 ? (
              <div className={styles.miniRow}>
                {roll.results.map((r, i) => (
                  <span key={i} className={styles.miniDie} style={{ animationDelay: `${i * 80}ms` }}>
                    <DieShape sides={roll.sides} value={String(r)} size={30} />
                  </span>
                ))}
              </div>
            ) : null}
            <p className={`${styles.pop} font-serif text-[24px] font-semibold`} data-testid="dice-result">
              {resultText}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
