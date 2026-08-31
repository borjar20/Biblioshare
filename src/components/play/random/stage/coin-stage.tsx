"use client";

import { useState } from "react";
import styles from "./stage.module.css";
import { buzz } from "./stage-helpers";
import { useReducedMotion } from "./use-reduced-motion";

// Cara: sol. Cruz: aspa con laurel. Misma familia visual que random-table-mark.
function HeadsFace() {
  return (
    <svg viewBox="0 0 110 110" aria-hidden="true">
      <circle cx="55" cy="55" r="53" fill="var(--surface-3)" stroke="var(--border)" strokeWidth="3" />
      <circle cx="55" cy="55" r="18" fill="none" stroke="var(--gold-graphic)" strokeWidth="4" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={55 + 26 * Math.cos(a)}
            y1={55 + 26 * Math.sin(a)}
            x2={55 + 38 * Math.cos(a)}
            y2={55 + 38 * Math.sin(a)}
            stroke="var(--gold-graphic)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function TailsFace() {
  return (
    <svg viewBox="0 0 110 110" aria-hidden="true">
      <circle cx="55" cy="55" r="53" fill="var(--surface-3)" stroke="var(--border)" strokeWidth="3" />
      <path
        d="M38 38 L72 72 M72 38 L38 72"
        stroke="var(--gold-graphic)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M30 78 Q55 92 80 78"
        fill="none"
        stroke="var(--gold-graphic)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Moneda 3D: varias revoluciones y cae del lado emitido. */
export function CoinStage({
  flip,
  resultText,
  onFlip,
  label,
}: {
  flip: { id: string; result: "heads" | "tails" } | null;
  resultText: string | null;
  onFlip: () => void;
  label: string;
}) {
  const reduced = useReducedMotion();
  const [landedId, setLandedId] = useState<string | null>(null);
  const landed = flip !== null && (reduced || landedId === flip.id);

  return (
    <div className={styles.stage}>
      <button type="button" aria-label={label} onClick={onFlip} className={styles.objectButton}>
        <span className={styles.coinScene}>
          <span
            key={flip?.id ?? "idle"}
            className={flip && !reduced ? `${styles.coinSpin} ${styles.coinFlip}` : styles.coinSpin}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && flip) {
                setLandedId(flip.id);
                buzz();
              }
            }}
          >
            <span
              className={styles.coin}
              style={flip?.result === "tails" ? { transform: "rotateX(180deg)" } : undefined}
            >
              <span className={styles.coinFace}>
                <HeadsFace />
              </span>
              <span className={`${styles.coinFace} ${styles.coinBack}`}>
                <TailsFace />
              </span>
            </span>
          </span>
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {landed && flip ? (
          <p className={`${styles.pop} font-serif text-[24px] font-semibold`} data-testid="coin-result">
            {resultText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
