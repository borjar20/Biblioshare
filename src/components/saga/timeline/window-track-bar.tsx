import type { TimelineTrack } from "@/lib/sagas/derive-timeline";

// La barra del frame B: el orden de lectura entero como carril, el tramo de la
// ventana como banda con sus dos topes, y el lector como marcador. Pieza propia
// porque es lo ÚNICO del timeline con geometría — el resto de las filas son
// texto y tarjeta.
//
// Sin sesión, `youPct` es null y no se pinta marcador. Ese caso no es una
// variante secundaria: la ficha es pública, así que es la vista por defecto de
// cualquiera que llegue de fuera.
export function WindowTrackBar({
  track,
  ariaLabel,
  startLabel,
  endLabel,
}: {
  track: TimelineTrack;
  ariaLabel: string;
  startLabel: string;
  endLabel: string;
}) {
  return (
    <div data-testid="window-track" className="mt-2.5 border-t border-border pt-2">
      {/* `role="img"` con su etiqueta: la barra dice algo que el texto de
          alrededor no repite, y sin esto un lector de pantalla solo oiría los
          dos extremos del carril. */}
      <div role="img" aria-label={ariaLabel} className="relative my-1.5 h-[18px]">
        <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-surface-muted">
          <span
            className="absolute inset-y-0 bg-accent/30"
            style={{ left: `${track.fromPct}%`, right: `${100 - track.toPct}%` }}
          />
        </div>
        <span
          className="absolute top-0 h-[18px] w-[2.5px] rounded-full bg-accent"
          style={{ left: `${track.fromPct}%` }}
        />
        <span
          className="absolute top-0 h-[18px] w-[2.5px] rounded-full bg-accent"
          style={{ left: `${track.toPct}%` }}
        />
        {track.youPct !== null && (
          <span
            data-testid="window-track-you"
            className="absolute top-[-2px] h-[22px] w-[10px] -translate-x-1/2 rounded border-[2.5px] border-foreground bg-surface"
            style={{ left: `${track.youPct}%` }}
          />
        )}
      </div>
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.04em] text-muted-foreground">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
