import { SEAT_ACCENT } from "@/lib/play/ui/seats";

/**
 * La marca de Puntuación es el DIBUJO de su tabla: filas de jugador con el color de
 * asiento de verdad, no una hoja en blanco. Mismo patrón que `mtg-table-mark.tsx` —
 * sin texto ni `<title>`, la etiqueta la pone la tarjeta que lo envuelve.
 */
export function ScoreTableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <rect x="8" y="8" width="48" height="48" rx="8" fill="var(--play-felt)" />
      {/* Cabecera de columnas: ronda tras ronda hasta el total. */}
      <rect x="14" y="14" width="36" height="4" rx="2" fill="var(--play-rail)" />
      {/* Tres filas de jugador: la barra de color a la izquierda, la traza de
          puntuación a la derecha — igual que una fila real del tablero. */}
      <rect x="14" y="25" width="5" height="4" rx="2" fill={`var(${SEAT_ACCENT[0].varName})`} />
      <rect x="22" y="25" width="28" height="4" rx="2" fill="var(--play-rail)" />
      <rect x="14" y="34" width="5" height="4" rx="2" fill={`var(${SEAT_ACCENT[1].varName})`} />
      <rect x="22" y="34" width="28" height="4" rx="2" fill="var(--play-rail)" />
      <rect x="14" y="43" width="5" height="4" rx="2" fill={`var(${SEAT_ACCENT[2].varName})`} />
      <rect x="22" y="43" width="28" height="4" rx="2" fill="var(--play-rail)" />
    </svg>
  );
}
