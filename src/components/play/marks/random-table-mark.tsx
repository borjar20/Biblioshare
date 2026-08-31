/**
 * La marca del Aleatorio es un DADO sobre la mesa con una moneda al lado:
 * silueta distinta de la hoja de puntuación (papel con rejilla) y de la mesa
 * de Magic (fieltro con asientos) a tamaño de tarjeta. Sin texto ni <title>:
 * la etiqueta la pone la tarjeta que lo envuelve.
 */
export function RandomTableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      {/* El dado, ligeramente girado. */}
      <g transform="rotate(-8 28 32)">
        <rect
          x="12"
          y="16"
          width="30"
          height="30"
          rx="6"
          fill="var(--surface)"
          stroke="var(--play-rail)"
          strokeWidth="1.5"
        />
        {/* Cinco pips. */}
        <circle cx="20" cy="24" r="2.5" fill="var(--play-rail)" />
        <circle cx="34" cy="24" r="2.5" fill="var(--play-rail)" />
        <circle cx="27" cy="31" r="2.5" fill="var(--play-rail)" />
        <circle cx="20" cy="38" r="2.5" fill="var(--play-rail)" />
        <circle cx="34" cy="38" r="2.5" fill="var(--play-rail)" />
      </g>
      {/* La moneda, medio detrás del dado. */}
      <circle cx="47" cy="42" r="9" fill="var(--play-felt)" stroke="var(--play-rail)" strokeWidth="1.5" />
      <circle cx="47" cy="42" r="5.5" fill="none" stroke="var(--play-rail)" strokeWidth="1" />
    </svg>
  );
}
