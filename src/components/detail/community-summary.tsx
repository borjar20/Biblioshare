import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { starLabel } from "@/lib/stats/rating";
import type { ItemType } from "@/lib/catalog/types";

// El resumen de notas de la comunidad: la media grande, los dots, los votos y
// el histograma vertical por MEDIA estrella (0,5→5, estilo Letterboxd).
//
// Una sola pieza para los dos anchos, porque solo cambia la DIRECCIÓN:
//   móvil (`.comm-top` del frame 2)  → en fila: media | histograma al lado.
//   PC    (`.rate-card` del frame 9) → en columna y centrada, el histograma
//                                      debajo, pegada al scroll.
export function CommunitySummary({
  itemType,
  avgRating,
  distribution,
  ratingsLabel,
}: {
  itemType: ItemType;
  /** Media 1–10 (la escala de guardado), NO la de 5 que se enseña. */
  avgRating: number;
  /** Recuento por media estrella, ascendente: [0,5★, 1★, …, 5★] (10 cubos). */
  distribution: number[];
  ratingsLabel: string;
}) {
  const accent = MEDIA_ACCENT[itemType];
  // La barra más alta manda: se mide contra el pico real, no contra el total,
  // o un reparto plano se vería como diez muñones. Todo el histograma va en el
  // color del tipo de obra; el pico, a plena intensidad, para dar foco visual.
  const max = Math.max(...distribution, 1);
  const peak = distribution.reduce(
    (best, count, i) => (count > distribution[best] ? i : best),
    0,
  );

  return (
    <div className="flex items-center gap-5 rounded-[12px] border border-border bg-surface p-4 lg:flex-col lg:gap-0 lg:p-6 lg:text-center">
      <div className="shrink-0 text-center">
        {/* `formatDots`, NO `avgRating.toFixed(1)`: la media se guarda 1–10 y
            se ENSEÑA sobre 5. Con toFixed, esta pestaña decía "8,4" mientras
            el hero de la misma ficha decía "4,2" — dos números para la misma
            nota. Y de paso el punto pasa a ser coma (es-ES). */}
        <div
          className={`font-serif text-[42px] leading-none font-semibold lg:text-[58px] ${accent.text}`}
        >
          {formatDots(avgRating)}
        </div>
        <div className="mt-1 flex justify-center lg:mt-2.5">
          <RatingDots value={avgRating} size="sm" className="lg:hidden" itemType={itemType} />
          <RatingDots value={avgRating} size="md" className="hidden lg:flex" itemType={itemType} />
        </div>
        <div className="mt-[5px] font-mono text-[10px] text-muted-foreground lg:text-[11px]">
          {ratingsLabel}
        </div>
      </div>

      {/* El histograma: al lado en móvil (flex-1), debajo y a lo ancho en PC.
          Diez barras verticales, una por media estrella; el eje se marca con
          ★ … ★★★★★ debajo, sin rotular cada barra. El recuento exacto vive en
          el tooltip, no como texto fijo (se pierde precisión, gana legibilidad). */}
      <div className="flex-1 lg:mt-5 lg:w-full lg:flex-none">
        <div className="flex h-16 items-end gap-[3px]">
          {distribution.map((count, i) =>
            // Cero MEDIDO —una media estrella que nadie ha puesto—: una marca
            // fina en la base, igual que el histograma de /estadísticas. Un
            // hueco invisible confundiría «cero votos» con «no hay dato».
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
                  // El color del TIPO de obra (var inline: Tailwind no vería una
                  // clase interpolada). El pico a plena intensidad y el resto
                  // atenuado, para que la moda destaque sin cambiar de tono.
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
    </div>
  );
}
