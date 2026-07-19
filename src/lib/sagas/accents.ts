// Paleta de subsagas (spec §1.1): tokens persistidos en sagas.accent_color.
// Clases completas para el JIT (patrón MEDIA_ACCENT). Todos los tokens apuntan
// a variables con variante clara/oscura en globals.css.

export type SagaAccentToken =
  | "terracota"
  | "verde"
  | "teal"
  | "ambar"
  | "purpura"
  | "beige";

export type SagaAccentClasses = {
  /** relleno sólido (segmentos de progreso, ticks) */
  bg: string;
  text: string;
  border: string;
  /** tick de cabecera de grupo (mismo color que bg; alias semántico) */
  tick: string;
};

export const SAGA_ACCENT: Record<SagaAccentToken, SagaAccentClasses> = {
  terracota: { bg: "bg-accent", text: "text-accent", border: "border-accent", tick: "bg-accent" },
  verde: { bg: "bg-green", text: "text-green", border: "border-green", tick: "bg-green" },
  teal: { bg: "bg-type-movie", text: "text-type-movie", border: "border-type-movie", tick: "bg-type-movie" },
  ambar: { bg: "bg-gold", text: "text-gold", border: "border-gold", tick: "bg-gold" },
  purpura: { bg: "bg-type-series", text: "text-type-series", border: "border-type-series", tick: "bg-type-series" },
  beige: { bg: "bg-spine", text: "text-spine", border: "border-spine", tick: "bg-spine" },
};

/** Rotación estable para subsagas sin accent_color persistido. */
export const SAGA_ACCENT_SEQUENCE: readonly SagaAccentToken[] = [
  "terracota",
  "verde",
  "teal",
  "ambar",
  "purpura",
];

export function isSagaAccentToken(value: string | null): value is SagaAccentToken {
  return value !== null && value in SAGA_ACCENT;
}
