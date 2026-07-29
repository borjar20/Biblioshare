import { brandMarkGeom } from "./brand-mark-geometry";

// Marca de la app: tres lomos (libro / película / serie) alineados abajo.
// Colores aclarados del app-icon — NO los --type-*, que sobre terracota no
// contrastan. Decorativa: aria-hidden.
const SPINE_COLORS = ["#e8b06a", "#7fc6c9", "#caa2d0"] as const;

export function BrandMark({ height, className }: { height: number; className?: string }) {
  const geom = brandMarkGeom(height);
  return (
    <div
      aria-hidden
      className={className}
      style={{ display: "flex", alignItems: "flex-end", gap: geom.gap }}
    >
      {geom.spines.map((s, i) => (
        <span
          key={i}
          style={{
            width: s.width,
            height: s.height,
            background: SPINE_COLORS[i],
            borderRadius: `${s.radiusTop}px ${s.radiusTop}px ${s.radiusBottom}px ${s.radiusBottom}px`,
          }}
        />
      ))}
    </div>
  );
}
