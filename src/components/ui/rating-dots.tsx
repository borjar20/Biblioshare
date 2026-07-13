// Five-dot rating readout. Values are on a 0–5 scale; empty dots fall back to
// the muted border colour.
//
// El relleno es ORO, no el acento del tipo de medio: en Paper la valoración es
// oro en todas partes (dots, estrellas, histograma), y el color de tipo se
// reserva para identificar el medio. `fillClassName` sigue existiendo por si
// algún sitio necesita otra cosa, pero lo normal es no pasarlo.
export function RatingDots({
  value,
  max = 5,
  fillClassName = "bg-gold",
  className = "",
}: {
  value: number;
  max?: number;
  /** Tailwind bg-* class for filled dots. Por defecto, oro. */
  fillClassName?: string;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i < Math.round(value) ? fillClassName : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}
