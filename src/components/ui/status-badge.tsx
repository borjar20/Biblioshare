const STATUS_DOT_CLASSES = {
  planned: "bg-status-planned",
  in_progress: "bg-status-in-progress",
  completed: "bg-status-completed",
  dropped: "bg-status-dropped",
} as const;

// `dotOnly`: solo el punto de estado (overlay de portada en la rejilla de la
// colección, mockup .cc .sb) — el nombre del estado queda en el aria-label.
export function StatusBadge({
  status,
  label,
  dotOnly = false,
}: {
  status: keyof typeof STATUS_DOT_CLASSES;
  label: string;
  dotOnly?: boolean;
}) {
  if (dotOnly) {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-background ${STATUS_DOT_CLASSES[status]}`}
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-foreground">
      <span
        className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASSES[status]}`}
      />
      {label}
    </span>
  );
}
