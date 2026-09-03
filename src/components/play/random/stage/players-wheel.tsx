"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./stage.module.css";
import { buzz, wheelSectors, wheelTargetAngle } from "./stage-helpers";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";

function polar(r: number, angle: number): { x: number; y: number } {
  const rad = ((angle - 90) * Math.PI) / 180; // 0° arriba, horario
  return { x: 100 + r * Math.cos(rad), y: 100 + r * Math.sin(rad) };
}

function sectorPath(start: number, end: number): string {
  const a = polar(96, start);
  const b = polar(96, end);
  const large = end - start > 180 ? 1 : 0;
  return `M 100 100 L ${a.x} ${a.y} A 96 96 0 ${large} 1 ${b.x} ${b.y} Z`;
}

/**
 * Ruleta de primer jugador. La rotación solo avanza (acumula vueltas) para que
 * cada giro sea hacia delante; el resultado ya está emitido y la rueda
 * decelera hasta dejarlo bajo la flecha. El nombre (players-result) aparece al
 * parar la transición.
 */
export function PlayersWheel({
  players,
  spin,
  onSpin,
  label,
  disabled,
  hint,
}: {
  players: string[];
  spin: { id: string; picked: string } | null;
  onSpin: () => void;
  label: string;
  disabled: boolean;
  hint: string;
}) {
  const reduced = useReducedMotion();
  const [rotation, setRotation] = useState(0);
  const [landedId, setLandedId] = useState<string | null>(null);
  const lastId = useRef<string | null>(null);

  const sectors = useMemo(() => (players.length >= 2 ? wheelSectors(players) : []), [players]);

  useEffect(() => {
    if (!spin || spin.id === lastId.current) return;
    lastId.current = spin.id;
    if (reduced || !players.includes(spin.picked)) {
      // Sin animación (o la lista ya cambió): resultado directo.
      setLandedId(spin.id);
      return;
    }
    setRotation((prev) => {
      const base = ((prev % 360) + 360) % 360;
      return prev - base + wheelTargetAngle(players, spin.picked, 4);
    });
  }, [spin, players, reduced]);

  const landed = spin !== null && (reduced || landedId === spin.id);

  return (
    <div className={styles.stage}>
      <button
        type="button"
        aria-label={label}
        onClick={onSpin}
        disabled={disabled}
        className={styles.objectButton}
      >
        <span className={styles.wheelWrap}>
          <span className={styles.wheelArrow} aria-hidden="true" />
          <svg
            viewBox="0 0 200 200"
            className={styles.wheel}
            style={{ transform: `rotate(${rotation}deg)` }}
            onTransitionEnd={() => {
              if (spin) {
                setLandedId(spin.id);
                buzz();
              }
            }}
            aria-hidden="true"
          >
            {sectors.length === 0 ? (
              <circle cx="100" cy="100" r="96" fill="var(--surface-muted)" stroke="var(--border)" />
            ) : (
              sectors.map((s) => (
                <g key={s.name}>
                  <path d={sectorPath(s.start, s.end)} fill={s.color} stroke="var(--surface)" />
                  {(() => {
                    const mid = (s.start + s.end) / 2;
                    const p = polar(62, mid);
                    return (
                      <text
                        x={p.x}
                        y={p.y}
                        fill="var(--surface)"
                        fontSize="12"
                        fontWeight="600"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${mid} ${p.x} ${p.y})`}
                      >
                        {s.name.length > 9 ? `${s.name.slice(0, 8)}…` : s.name}
                      </text>
                    );
                  })()}
                </g>
              ))
            )}
          </svg>
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {landed && spin ? (
          <p className={`${styles.pop} font-serif text-[24px] font-semibold`} data-testid="players-result">
            {spin.picked}
          </p>
        ) : !spin ? (
          <p className="text-[14px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
