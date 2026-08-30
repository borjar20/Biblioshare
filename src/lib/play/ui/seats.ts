/**
 * Color de asiento de BiblioPlay. Mismo patrón que `src/lib/catalog/media-accent.ts`:
 * las clases se escriben ENTERAS (invariante `inv-tailwind-literal`) porque el JIT de
 * Tailwind lee el código fuente — una clase interpolada no existe en el CSS final.
 *
 * Son seis porque seis es el máximo de jugadores del modo Commander (`mtg/modes.ts`).
 * Se asume que ciruela e índigo se rozan a contraluz: el color NO es el único
 * distintivo (también están el nombre, el comandante y la posición en la mesa), y
 * cuatro colores repetidos con un rayado se leen peor que seis parecidos. El suelo
 * de esa cercanía lo defiende `src/app/contraste-play.test.ts`.
 */
export type SeatAccent = {
  /** Barra sólida del asiento: mira siempre al centro de la mesa. */
  bar: string;
  /** Tinte suave: mitad pulsada del panel y fondo de tarjeta predefinido. */
  tint: string;
  /** Texto sobre el papel (nombre del comandante en la tira de daño). */
  text: string;
  /** Anillo del asiento activo. */
  ring: string;
  /**
   * Variable CSS cruda, para degradados y `style` calculado. Deliberadamente
   * `--play-seat-*` y no el `--color-play-seat-*` de Tailwind: `@theme inline`
   * INLINEA esos nombres en las utilidades en vez de emitirlos, así que
   * `var(--color-play-seat-1)` no resolvería a nada en runtime.
   */
  varName: string;
};

export const SEAT_COUNT = 6;

export const SEAT_ACCENT: SeatAccent[] = [
  {
    bar: "bg-play-seat-1",
    tint: "bg-play-seat-1/15",
    text: "text-play-seat-1",
    ring: "ring-play-seat-1",
    varName: "--play-seat-1",
  },
  {
    bar: "bg-play-seat-2",
    tint: "bg-play-seat-2/15",
    text: "text-play-seat-2",
    ring: "ring-play-seat-2",
    varName: "--play-seat-2",
  },
  {
    bar: "bg-play-seat-3",
    tint: "bg-play-seat-3/15",
    text: "text-play-seat-3",
    ring: "ring-play-seat-3",
    varName: "--play-seat-3",
  },
  {
    bar: "bg-play-seat-4",
    tint: "bg-play-seat-4/15",
    text: "text-play-seat-4",
    ring: "ring-play-seat-4",
    varName: "--play-seat-4",
  },
  {
    bar: "bg-play-seat-5",
    tint: "bg-play-seat-5/15",
    text: "text-play-seat-5",
    ring: "ring-play-seat-5",
    varName: "--play-seat-5",
  },
  {
    bar: "bg-play-seat-6",
    tint: "bg-play-seat-6/15",
    text: "text-play-seat-6",
    ring: "ring-play-seat-6",
    varName: "--play-seat-6",
  },
];

/** Índice de asiento -> color, envolviendo: un índice fuera de rango repite color, no rompe. */
export function seatAccent(seat: number): SeatAccent {
  return SEAT_ACCENT[((seat % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT];
}
