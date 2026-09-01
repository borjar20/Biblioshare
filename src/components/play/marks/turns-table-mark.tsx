import { SEAT_ACCENT } from "@/lib/play/ui/seats";

/**
 * La marca de Turnos es la mesa vista desde arriba: cuatro asientos en anillo
 * con el activo mayor y una flecha de rotación en --accent-ink. Sin texto ni
 * <title>: la etiqueta la pone la tarjeta que lo envuelve.
 */
export function TurnsTableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <ellipse cx="32" cy="54" rx="24" ry="5" fill="var(--play-felt)" />
      {/* Los cuatro asientos: el de arriba, activo y mayor. */}
      <circle cx="32" cy="14" r="9" fill={`var(${SEAT_ACCENT[0].varName})`} />
      <circle cx="52" cy="32" r="6" fill={`var(${SEAT_ACCENT[1].varName})`} />
      <circle cx="32" cy="48" r="6" fill={`var(${SEAT_ACCENT[2].varName})`} />
      <circle cx="12" cy="32" r="6" fill={`var(${SEAT_ACCENT[3].varName})`} />
      {/* Flecha de rotación entre asientos. */}
      <path
        d="M 44 18 A 17 17 0 0 1 49 26"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <polygon points="50,29 44,25 51,22" fill="var(--accent-ink)" />
    </svg>
  );
}
