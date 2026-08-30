import { SEAT_ACCENT } from "@/lib/play/ui/seats";

/**
 * La marca de Magic es el DIBUJO de su mesa: cuatro asientos alrededor de un
 * tablero, con los colores de asiento de verdad. No lleva texto ni `<title>` — la
 * etiqueta la pone la tarjeta que lo envuelve, y un título aquí lo leería el lector
 * de pantalla dos veces.
 */
export function MtgTableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <rect x="8" y="8" width="48" height="48" rx="8" fill="var(--play-felt)" />
      {/* Los cuatro asientos, mirando al centro: arriba, abajo y los dos costados. */}
      <rect x="18" y="11" width="28" height="5" rx="2.5" fill={`var(${SEAT_ACCENT[0].varName})`} />
      <rect x="18" y="48" width="28" height="5" rx="2.5" fill={`var(${SEAT_ACCENT[1].varName})`} />
      <rect x="11" y="18" width="5" height="28" rx="2.5" fill={`var(${SEAT_ACCENT[2].varName})`} />
      <rect x="48" y="18" width="5" height="28" rx="2.5" fill={`var(${SEAT_ACCENT[3].varName})`} />
      {/* La consola, en medio, que es donde vive el turno. */}
      <rect x="20" y="30" width="24" height="4" rx="2" fill="var(--play-rail)" />
    </svg>
  );
}
