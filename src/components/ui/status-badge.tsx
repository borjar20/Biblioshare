const STATUS_DOT_CLASSES = {
  planned: "bg-status-planned",
  in_progress: "bg-status-in-progress",
  completed: "bg-status-completed",
  dropped: "bg-status-dropped",
} as const;

// `dotOnly`: solo el punto de estado (overlay de portada en la rejilla de la
// colección, mockup .cc .sb) — el nombre del estado queda en el aria-label.
//
// `variant`:
// - "chip" (por defecto): la pastilla compacta de las tarjetas de biblioteca.
// - "hero": la .hero-status de la ficha (mockup "Paper - Ficha de título
//   completa") — más grande, sobre surface con borde, y con la etiqueta larga
//   ("En tu biblioteca · Leyendo") que le compone quien la usa.
export function StatusBadge({
  status,
  label,
  dotOnly = false,
  variant = "chip",
}: {
  status: keyof typeof STATUS_DOT_CLASSES;
  label: string;
  dotOnly?: boolean;
  variant?: "chip" | "hero";
}) {
  if (dotOnly) {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        data-testid="status-badge"
        className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-background ${STATUS_DOT_CLASSES[status]}`}
      />
    );
  }

  if (variant === "hero") {
    return (
      <span
        data-testid="status-badge"
        className="inline-flex items-center gap-[7px] rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground"
      >
        <span
          className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[status]}`}
        />
        {label}
      </span>
    );
  }

  return (
    <span
      data-testid="status-badge"
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-foreground"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASSES[status]}`}
      />
      {label}
    </span>
  );
}
