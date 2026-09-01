import { SEAT_ACCENT } from "@/lib/play/ui/seats";

/**
 * La marca de Recursos son pilas de fichas con una moneda dorada encima,
 * sobre fieltro: fichas en colores de asiento, moneda con el sol de la casa
 * (--gold-graphic, como en la marca del Aleatorio). Sin texto ni <title>:
 * la etiqueta la pone la tarjeta que lo envuelve.
 */
export function ResourcesTableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <ellipse cx="32" cy="54" rx="24" ry="5" fill="var(--play-felt)" />
      {/* Pila izquierda de fichas. */}
      <rect x="10" y="44" width="18" height="5" rx="2.5" fill={`var(${SEAT_ACCENT[0].varName})`} />
      <rect x="12" y="38" width="18" height="5" rx="2.5" fill={`var(${SEAT_ACCENT[2].varName})`} />
      <rect x="11" y="32" width="18" height="5" rx="2.5" fill={`var(${SEAT_ACCENT[0].varName})`} />
      {/* Pila derecha. */}
      <rect x="36" y="44" width="18" height="5" rx="2.5" fill={`var(${SEAT_ACCENT[1].varName})`} />
      <rect x="34" y="38" width="18" height="5" rx="2.5" fill={`var(${SEAT_ACCENT[3].varName})`} />
      {/* Moneda dorada con el sol. */}
      <circle cx="43" cy="26" r="10" fill="var(--surface)" stroke="var(--gold-graphic)" strokeWidth="1.5" />
      <circle cx="43" cy="26" r="3.5" fill="none" stroke="var(--gold-graphic)" strokeWidth="1.2" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={43 + 5 * Math.cos(a)}
            y1={26 + 5 * Math.sin(a)}
            x2={43 + 7.5 * Math.cos(a)}
            y2={26 + 7.5 * Math.sin(a)}
            stroke="var(--gold-graphic)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        );
      })}
      {/* Ficha suelta, para romper la simetría. */}
      <circle cx="22" cy="24" r="6" fill="var(--surface-3)" stroke="var(--play-rail)" strokeWidth="1.5" />
    </svg>
  );
}
