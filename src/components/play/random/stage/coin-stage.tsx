"use client";

import styles from "./stage.module.css";
import { useLandingGate } from "./use-landing-gate";

const COIN_VISIBLE_MAX = 5;

function coinSize(n: number): number {
  if (n <= 1) return 110;
  if (n === 2) return 88;
  return 64;
}

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

/**
 * Monedas 3D: varias revoluciones (stagger 60 ms) y cada una cae del lado
 * emitido. Revelación única al aterrizar la última (useLandingGate). En
 * reposo enseña tantas monedas como el stepper y el hint que centra.
 */
export function CoinStage({
  flip,
  idleCount,
  resultText,
  onFlip,
  label,
  hint,
}: {
  flip: { id: string; results: ("heads" | "tails")[] } | null;
  idleCount: number;
  resultText: string | null;
  onFlip: () => void;
  label: string;
  hint: string;
}) {
  const visible = Math.min(flip ? flip.results.length : idleCount, COIN_VISIBLE_MAX);
  const { landed, reduced, onOneEnd } = useLandingGate(flip?.id ?? null, visible);
  const size = coinSize(visible);

  return (
    <div className={styles.stage}>
      <button type="button" aria-label={label} onClick={onFlip} className={styles.objectButton}>
        <span className={styles.coinRow}>
          {Array.from({ length: visible }, (_, i) => (
            <span
              key={`${flip?.id ?? "idle"}-${i}`}
              className={styles.coinScene}
              style={{ width: size, height: size }}
            >
              <span
                className={flip && !reduced ? `${styles.coinSpin} ${styles.coinFlip}` : styles.coinSpin}
                style={{ animationDelay: `${i * 60}ms` }}
                onAnimationEnd={onOneEnd}
              >
                <span
                  className={styles.coin}
                  style={flip && flip.results[i] === "tails" ? { transform: "rotateX(180deg)" } : undefined}
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
          ))}
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {landed && flip ? (
          <p className={`${styles.pop} font-serif text-[24px] font-semibold`} data-testid="coin-result">
            {resultText}
          </p>
        ) : !flip ? (
          <p className="text-[14px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
