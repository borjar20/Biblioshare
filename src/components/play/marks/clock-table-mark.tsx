import { SEAT_ACCENT } from "@/lib/play/ui/seats";

/**
 * La marca del Reloj es un reloj de ajedrez clásico sobre fieltro: caja con
 * dos esferas y dos pulsadores — el hundido en color de asiento delata quién
 * mueve. Agujas en --accent-ink, como el «20» de la marca del Aleatorio. Sin
 * texto ni <title>: la etiqueta la pone la tarjeta que lo envuelve.
 */
export function ClockTableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <ellipse cx="32" cy="54" rx="24" ry="5" fill="var(--play-felt)" />
      {/* Pulsadores: el izquierdo hundido (turno del asiento 1). */}
      <rect x="14" y="18" width="12" height="6" rx="2" fill={`var(${SEAT_ACCENT[0].varName})`} />
      <rect x="38" y="14" width="12" height="8" rx="2" fill={`var(${SEAT_ACCENT[1].varName})`} />
      {/* Caja. */}
      <rect
        x="8"
        y="22"
        width="48"
        height="28"
        rx="5"
        fill="var(--surface)"
        stroke="var(--play-rail)"
        strokeWidth="1.5"
      />
      {/* Dos esferas con agujas. */}
      <circle cx="21" cy="36" r="9" fill="var(--surface)" stroke="var(--play-rail)" strokeWidth="1.5" />
      <circle cx="43" cy="36" r="9" fill="var(--surface)" stroke="var(--play-rail)" strokeWidth="1.5" />
      <line x1="21" y1="36" x2="21" y2="30" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="21" y1="36" x2="25" y2="38" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="43" y1="36" x2="43" y2="31" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="43" y1="36" x2="40" y2="33" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
