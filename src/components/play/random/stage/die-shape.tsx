import { dieShapeFor, type DieShapeKind } from "./stage-helpers";

// Puntos de cada silueta poligonal en viewBox 100×100 (margen para el trazo).
const POLYGONS: Record<Exclude<DieShapeKind, "d6" | "round">, string> = {
  d4: "50,8 94,84 6,84",
  d8: "50,4 96,50 50,96 4,50",
  d10: "50,3 90,40 50,97 10,40",
  d12: "50,6 93.7,37.8 77,89.2 23,89.2 6.3,37.8",
  d20: "50,3 90.7,26.5 90.7,73.5 50,97 9.3,73.5 9.3,26.5",
};

// Centro óptico del texto por silueta: en d8/d10 el número sube a la cara
// frontal que dibujan las facetas; el triángulo carga la masa abajo.
const TEXT_Y: Record<DieShapeKind, number> = {
  d4: 62,
  d6: 50,
  d8: 34,
  d10: 38,
  d12: 52,
  d20: 50,
  round: 50,
};

const LINE = { stroke: "var(--border)", strokeWidth: 2 } as const;
const SHADE = { fill: "var(--surface-muted)" } as const;

// Pentágono del d12 y su cara frontal (mismos vértices a escala 0.55 hacia el
// centro óptico (50,52)).
const D12_OUTER: [number, number][] = [
  [50, 6],
  [93.7, 37.8],
  [77, 89.2],
  [23, 89.2],
  [6.3, 37.8],
];
const D12_INNER: [number, number][] = [
  [50, 26.7],
  [74, 44.2],
  [64.9, 72.5],
  [35.1, 72.5],
  [26, 44.2],
];

// Falso 3D: aristas internas y facetas laterales del poliedro real visto de
// frente. d4/d6/round quedan planos (silueta ya inequívoca).
function Facets({ kind }: { kind: DieShapeKind }) {
  switch (kind) {
    case "d8":
      return (
        <>
          <polygon points="4,50 96,50 50,96" {...SHADE} />
          <line x1="4" y1="50" x2="96" y2="50" {...LINE} />
        </>
      );
    case "d10":
      return (
        <>
          <polygon points="10,40 50,64 50,97" {...SHADE} />
          <polygon points="90,40 50,64 50,97" {...SHADE} />
          <polyline points="10,40 50,64 90,40" fill="none" {...LINE} />
          <line x1="50" y1="64" x2="50" y2="97" {...LINE} />
        </>
      );
    case "d12":
      return (
        <>
          <polygon points={D12_INNER.map((p) => p.join(",")).join(" ")} fill="none" {...LINE} />
          {D12_OUTER.map((p, i) => (
            <line key={i} x1={p[0]} y1={p[1]} x2={D12_INNER[i][0]} y2={D12_INNER[i][1]} {...LINE} />
          ))}
        </>
      );
    case "d20":
      return (
        <>
          <polygon points="50,3 90.7,26.5 90.7,73.5" {...SHADE} />
          <polygon points="50,3 9.3,26.5 9.3,73.5" {...SHADE} />
          <polygon points="9.3,73.5 50,97 90.7,73.5" {...SHADE} />
          <polygon points="50,3 90.7,73.5 9.3,73.5" fill="none" {...LINE} />
        </>
      );
    default:
      return null;
  }
}

/**
 * Dado SVG plano: silueta clásica por número de caras, facetas de falso 3D y
 * el valor en la cara frontal. Presentacional puro; el aria-label lo pone el
 * botón contenedor.
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
      <Facets kind={kind} />
      <text
        x="50"
        y={TEXT_Y[kind]}
        textAnchor="middle"
        dominantBaseline="central"
        // Suelo de legibilidad en tamaños mini: a size 30, 35 unidades de
        // viewBox son ~10.5px reales — menos que los 14px del cubo anterior.
        fontSize={size <= 30 ? (value.length >= 3 ? 34 : 44) : value.length >= 3 ? 26 : 35}
        fontWeight="600"
        style={{ fontVariantNumeric: "tabular-nums" }}
        fill="var(--foreground)"
      >
        {value}
      </text>
    </svg>
  );
}
