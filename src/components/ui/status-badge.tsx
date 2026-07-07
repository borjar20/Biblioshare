const STATUS_DOT_CLASSES = {
  planned: "bg-status-planned",
  in_progress: "bg-status-in-progress",
  completed: "bg-status-completed",
  dropped: "bg-status-dropped",
} as const;

export function StatusBadge({
  status,
  label,
}: {
  status: keyof typeof STATUS_DOT_CLASSES;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-foreground">
      <span
        className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASSES[status]}`}
      />
      {label}
    </span>
  );
}
