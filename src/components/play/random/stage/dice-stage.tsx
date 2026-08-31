"use client";

import { useMemo, useState } from "react";
import styles from "./stage.module.css";
import { buzz, faceRotation, fillerFaces, stableFace } from "./stage-helpers";
import { useReducedMotion } from "./use-reduced-motion";

// Colocación física de las 6 caras; el índice casa con faceRotation.
const FACE_TRANSFORMS = [
  "rotateY(0deg) translateZ(48px)",
  "rotateY(180deg) translateZ(48px)",
  "rotateY(90deg) translateZ(48px)",
  "rotateY(-90deg) translateZ(48px)",
  "rotateX(90deg) translateZ(48px)",
  "rotateX(-90deg) translateZ(48px)",
];

/**
 * Cubo 3D que rueda al tirar y aterriza mostrando el primer resultado en una
 * cara estable por id de evento (teatro determinista: el resultado ya está
 * emitido). Con N>1, al aterrizar aparecen mini-dados escalonados y el texto
 * completo con el total.
 */
export function DiceStage({
  roll,
  resultText,
  onRoll,
  label,
}: {
  roll: { id: string; sides: number; results: number[] } | null;
  resultText: string | null;
  onRoll: () => void;
  label: string;
}) {
  const reduced = useReducedMotion();
  const [landedId, setLandedId] = useState<string | null>(null);
  const landed = roll !== null && (reduced || landedId === roll.id);

  // Cara ganadora + relleno, estables por tirada (no cambian entre renders).
  const view = useMemo(() => {
    if (!roll) return { face: 0, faces: ["?", "2", "3", "4", "5", "6"] };
    const face = stableFace(roll.id);
    const filler = fillerFaces(roll.sides, 5);
    let f = 0;
    const faces = Array.from({ length: 6 }, (_, i) =>
      i === face ? String(roll.results[0]) : String(filler[f++]),
    );
    return { face, faces };
  }, [roll]);

  const rot = faceRotation(view.face);

  return (
    <div className={styles.stage}>
      <button type="button" aria-label={label} onClick={onRoll} className={styles.objectButton}>
        <span className={styles.cubeScene}>
          <span
            key={roll?.id ?? "idle"}
            className={roll && !reduced ? `${styles.cubeSpin} ${styles.tumble}` : styles.cubeSpin}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && roll) {
                setLandedId(roll.id);
                buzz();
              }
            }}
          >
            <span
              className={styles.cube}
              style={{ transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}
            >
              {view.faces.map((n, i) => (
                <span key={i} className={styles.face} style={{ transform: FACE_TRANSFORMS[i] }}>
                  {n}
                </span>
              ))}
            </span>
          </span>
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {landed && roll ? (
          <>
            {roll.results.length > 1 ? (
              <div className={styles.miniRow}>
                {roll.results.map((r, i) => (
                  <span key={i} className={styles.miniDie} style={{ animationDelay: `${i * 80}ms` }}>
                    {r}
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
