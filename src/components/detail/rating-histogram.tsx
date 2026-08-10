import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { starLabel } from "@/lib/stats/rating";
import type { ItemType } from "@/lib/catalog/types";

// Histograma de notas de la comunidad por MEDIA estrella (0,5→5, estilo
// Letterboxd): diez barras verticales teñidas con el color del TIPO de obra, el
// pico a plena intensidad y el resto atenuado. Extraído de `CommunitySummary`
// (ficha) para poder reusarlo en el raíl OBRA de `/post/[id]` sin duplicarlo.
// Presentacional puro (sin estado ni hooks): sirve en árbol server o client.
export function RatingHistogram({
  itemType,
  /** Recuento por media estrella, ascendente: [0,5★, 1★, …, 5★] (10 cubos). */
  distribution,
  /** Altura de las barras (utilidad Tailwind): `h-16` en la ficha, `h-10` compacto. */
  barsHeight = "h-16",
}: {
  itemType: ItemType;
  distribution: number[];
  barsHeight?: string;
}) {
  const accent = MEDIA_ACCENT[itemType];
  // La barra más alta manda: se mide contra el pico real, no contra el total,
  // o un reparto plano se vería como diez muñones.
  const max = Math.max(...distribution, 1);
  const peak = distribution.reduce(
    (best, count, i) => (count > distribution[best] ? i : best),
    0,
  );

  return (
    <div>
      <div className={`flex ${barsHeight} items-end gap-[3px]`}>
        {distribution.map((count, i) =>
          // Cero MEDIDO —media estrella que nadie ha puesto—: marca fina en la
          // base (como el histograma de /estadísticas). Un hueco invisible
          // confundiría «cero votos» con «no hay dato».
          count === 0 ? (
            <span
              key={i}
              title={`${starLabel((i + 1) / 2)}★ · 0`}
              className="h-0.5 min-w-0 flex-1 rounded-full bg-surface-3"
            />
          ) : (
            <span
              key={i}
              title={`${starLabel((i + 1) / 2)}★ · ${count}`}
              className="min-w-0 flex-1 rounded-t-[2px]"
              style={{
                // Mínimo de 4px: un voto suelto se ve, no se queda en muñón.
                height: `max(4px, ${(count / max) * 100}%)`,
                background: `var(${accent.varName})`,
                opacity: i === peak ? 1 : 0.4,
              }}
            />
          ),
        )}
      </div>
      <div className="border-b border-border" />
      <div className="mt-1 flex justify-between text-[9px] leading-none">
        <span className="text-muted-foreground">★</span>
        <span className={accent.text}>★★★★★</span>
      </div>
    </div>
  );
}
