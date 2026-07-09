// Five-dot rating readout (reel+shelf-style), tinted with a media accent.
// Values are on a 0–5 scale; empty dots fall back to the muted border colour.
export function RatingDots({
  value,
  max = 5,
  fillClassName = "bg-accent",
  className = "",
}: {
  value: number;
  max?: number;
  /** Tailwind bg-* class for filled dots (e.g. a MediaAccent.bg). */
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
