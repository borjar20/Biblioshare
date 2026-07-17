import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import type { ItemType } from "@/lib/catalog/types";

// El resumen de notas de la comunidad: la media grande, los dots, los votos y
// el histograma 5→1.
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
  /** Porcentaje por cubo, de 5 a 1. */
  distribution: number[];
  ratingsLabel: string;
}) {
  const accent = MEDIA_ACCENT[itemType];
  // La barra más alta manda: con todos los votos repartidos, un 30% real se
  // vería como un muñón si se midiera contra el 100% teórico.
  const maxPct = Math.max(...distribution, 1);

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
          <RatingDots value={avgRating} size="sm" className="lg:hidden" />
          <RatingDots value={avgRating} size="md" className="hidden lg:flex" />
        </div>
        <div className="mt-[5px] font-mono text-[10px] text-muted-foreground lg:text-[11px]">
          {ratingsLabel}
        </div>
      </div>

      {/* El histograma: al lado en móvil (flex-1), debajo y a lo ancho en PC. */}
      <div className="flex flex-1 flex-col gap-[5px] lg:mt-5 lg:w-full lg:flex-none lg:gap-[7px]">
        {distribution.map((pct, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-[10px] text-muted-foreground lg:text-[11px]"
          >
            <span className="w-[22px] text-right font-mono">{5 - i}</span>
            <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-surface-muted lg:h-2">
              <i
                className="block h-full rounded-full bg-gold"
                style={{ width: `${(pct / maxPct) * 100}%` }}
              />
            </span>
            <span className="w-8 shrink-0 font-mono">{pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
