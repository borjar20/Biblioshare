/**
 * La marca del Aleatorio es un d20 FACETADO con una moneda dorada al lado,
 * sobre fieltro: el lenguaje visual real de la sección (hexágono con triángulo
 * inscrito, sol de la moneda) en miniatura. El «20» va en --accent-ink — eco
 * del terracota del CTA. Sin texto ni <title>: la etiqueta la pone la tarjeta
 * que lo envuelve.
 */
export function RandomTableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      {/* Fieltro: ancla la escena como en las marcas hermanas. */}
      <ellipse cx="32" cy="54" rx="24" ry="5" fill="var(--play-felt)" />

      {/* El d20, ligeramente girado: hexágono con cara frontal triangular y
          las tres esquinas laterales sombreadas (mismo dibujo que DieShape). */}
      <g transform="rotate(-8 27 30)">
        <polygon
          points="27,10 44.3,20 44.3,40 27,50 9.7,40 9.7,20"
          fill="var(--surface)"
          stroke="var(--play-rail)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <polygon points="27,10 44.3,20 44.3,40" fill="var(--play-felt)" />
        <polygon points="27,10 9.7,20 9.7,40" fill="var(--play-felt)" />
        <polygon points="9.7,40 27,50 44.3,40" fill="var(--play-felt)" />
        <polygon
          points="27,10 44.3,40 9.7,40"
          fill="none"
          stroke="var(--play-rail)"
          strokeWidth="1"
        />
        <text
          className="font-serif"
          x="27"
          y="30"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="11"
          fontWeight="600"
          fill="var(--accent-ink)"
        >
          20
        </text>
      </g>

      {/* La moneda dorada, medio delante del dado: el sol de la cara real. */}
      <circle
        cx="49"
        cy="44"
        r="9.5"
        fill="var(--surface)"
        stroke="var(--gold-graphic)"
        strokeWidth="1.5"
      />
      <circle cx="49" cy="44" r="3.5" fill="none" stroke="var(--gold-graphic)" strokeWidth="1.2" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={49 + 4.8 * Math.cos(a)}
            y1={44 + 4.8 * Math.sin(a)}
            x2={49 + 7 * Math.cos(a)}
            y2={44 + 7 * Math.sin(a)}
            stroke="var(--gold-graphic)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
