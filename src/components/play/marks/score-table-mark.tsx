import { SEAT_ACCENT } from "@/lib/play/ui/seats";

/**
 * La marca de Puntuación es una HOJA de puntuación, no una mesa: papel claro
 * en vertical con rejilla de columnas y la columna del total sombreada. La
 * silueta (papel claro con líneas) se distingue de la de Magic (mesa de
 * fieltro con asientos alrededor) incluso a tamaño de tarjeta — que era el
 * problema: las dos marcas parecían la misma (revisión 2026-08-31). Sin texto
 * ni `<title>`: la etiqueta la pone la tarjeta que lo envuelve.
 */
export function ScoreTableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      {/* La hoja, en vertical y ligeramente girada: papel sobre la mesa. */}
      <g transform="rotate(-4 32 32)">
        <rect
          x="14"
          y="6"
          width="36"
          height="52"
          rx="4"
          fill="var(--surface)"
          stroke="var(--play-rail)"
          strokeWidth="1.5"
        />
        {/* Rejilla: dos separadores de columnas de ronda... */}
        <line x1="28" y1="14" x2="28" y2="52" stroke="var(--play-rail)" strokeWidth="1" />
        <line x1="36" y1="14" x2="36" y2="52" stroke="var(--play-rail)" strokeWidth="1" />
        {/* ...y la columna del TOTAL, sombreada como en el tablero real. */}
        <rect x="40" y="10" width="7" height="44" rx="2" fill="var(--play-felt)" />
        {/* Cabecera de la hoja. */}
        <rect x="18" y="10" width="18" height="2.5" rx="1.25" fill="var(--play-rail)" />
        {/* Cuatro filas de jugador: su color de asiento en la primera columna. */}
        <rect x="18" y="18" width="7" height="3" rx="1.5" fill={`var(${SEAT_ACCENT[0].varName})`} />
        <rect x="18" y="27" width="7" height="3" rx="1.5" fill={`var(${SEAT_ACCENT[1].varName})`} />
        <rect x="18" y="36" width="7" height="3" rx="1.5" fill={`var(${SEAT_ACCENT[2].varName})`} />
        <rect x="18" y="45" width="7" height="3" rx="1.5" fill={`var(${SEAT_ACCENT[3].varName})`} />
        {/* Trazas de cifras en las celdas de ronda. */}
        <rect x="30" y="18" width="4" height="3" rx="1.5" fill="var(--play-rail)" />
        <rect x="30" y="27" width="4" height="3" rx="1.5" fill="var(--play-rail)" />
        <rect x="30" y="36" width="4" height="3" rx="1.5" fill="var(--play-rail)" />
        <rect x="30" y="45" width="4" height="3" rx="1.5" fill="var(--play-rail)" />
      </g>
    </svg>
  );
}
