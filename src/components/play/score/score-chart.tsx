"use client";

import { useTranslations } from "next-intl";
import { runningTotals } from "@/lib/play/score/selectors";
import type { ScoreState } from "@/lib/play/score/types";
import { seatAccent } from "@/lib/play/ui/seats";

/**
 * Evolución de la partida: el total acumulado de cada asiento, ronda a ronda,
 * con su color de mesa. Llena el hueco bajo la tabla (revisión 2026-08-31: era
 * todo espacio vacío) sin duplicar información — la CIFRA vive en la tabla, el
 * gráfico cuenta la FORMA de la partida: quién remonta, quién se despeña.
 *
 * SVG a mano, sin dependencias, `aria-hidden`: los datos ya están en la tabla
 * y un lector de pantalla no necesita oír la misma partida dos veces. Con
 * `preserveAspectRatio="none"` el dibujo se estira al hueco disponible;
 * `vector-effect="non-scaling-stroke"` mantiene los trazos a grosor real.
 */
export function ScoreChart({ state }: { state: ScoreState }) {
  const t = useTranslations("play");
  const series = runningTotals(state);
  const roundCount = series.length;

  // Línea del objetivo solo si es DE PUNTOS: un límite de rondas es el eje X,
  // no una cota en Y.
  const targetPoints = state.setup.target?.kind === "points" ? state.setup.target.value : null;

  if (roundCount === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <p className="text-[12px] text-muted-foreground">{t("scoreBoard.chartEmpty")}</p>
      </div>
    );
  }

  const flat = series.flat();
  const yMax = Math.max(1, targetPoints ?? 1, ...flat);
  const yMin = Math.min(0, ...flat);
  const span = yMax - yMin;
  // Todas las series arrancan en 0 en la «ronda 0»: la salida es parte de la
  // forma (se ve quién se separó del pelotón y cuándo).
  const x = (round: number) => (round / roundCount) * 100;
  const y = (value: number) => 100 - ((value - yMin) / span) * 96 - 2; // 2% de aire arriba y abajo

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
      className="h-full w-full"
    >
      {/* La línea del cero: sin ella, con totales negativos el suelo engaña. */}
      <line
        x1="0"
        y1={y(0)}
        x2="100"
        y2={y(0)}
        stroke="var(--play-rail)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {targetPoints !== null && (
        <line
          x1="0"
          y1={y(targetPoints)}
          x2="100"
          y2={y(targetPoints)}
          stroke="var(--play-rail)"
          strokeWidth="1"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {state.setup.participants.map((participant, seat) => (
        <polyline
          key={participant.id}
          points={`${x(0)},${y(0)} ${series.map((round, i) => `${x(i + 1)},${y(round[seat])}`).join(" ")}`}
          fill="none"
          stroke={`var(${seatAccent(seat).varName})`}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
