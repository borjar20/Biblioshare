import { dieShapeFor, type DieShapeKind } from "./stage-helpers";

// Puntos de cada silueta poligonal en viewBox 100×100 (margen para el trazo).
const POLYGONS: Record<Exclude<DieShapeKind, "d6" | "round">, string> = {
  d4: "50,8 94,84 6,84",
  d8: "50,4 96,50 50,96 4,50",
  d10: "50,3 90,40 50,97 10,40",
  d12: "50,6 93.7,37.8 77,89.2 23,89.2 6.3,37.8",
  d20: "50,3 90.7,26.5 90.7,73.5 50,97 9.3,73.5 9.3,26.5",
};

// Centro óptico del texto por silueta (el triángulo carga la masa abajo).
const TEXT_Y: Record<DieShapeKind, number> = {
  d4: 62,
  d6: 50,
  d8: 50,
  d10: 48,
  d12: 52,
  d20: 50,
  round: 50,
};

/**
 * Dado SVG plano: silueta clásica por número de caras con el valor centrado.
 * Presentacional puro; el aria-label lo pone el botón contenedor.
 */
export function DieShape({ sides, value, size }: { sides: number; value: string; size: number }) {
  const kind = dieShapeFor(sides);
  const shapeProps = { fill: "var(--surface-3)", stroke: "var(--border)", strokeWidth: 3 };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {kind === "d6" ? (
        <rect x="10" y="10" width="80" height="80" rx="14" {...shapeProps} />
      ) : kind === "round" ? (
        <circle cx="50" cy="50" r="45" {...shapeProps} />
      ) : (
        <polygon points={POLYGONS[kind]} strokeLinejoin="round" {...shapeProps} />
      )}
      <text
        x="50"
        y={TEXT_Y[kind]}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={value.length >= 3 ? 26 : 35}
        fontWeight="600"
        style={{ fontVariantNumeric: "tabular-nums" }}
        fill="var(--foreground)"
      >
        {value}
      </text>
    </svg>
  );
}
