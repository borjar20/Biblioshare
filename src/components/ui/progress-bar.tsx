export function ProgressBar({
  current,
  total,
  label,
}: {
  current: number;
  total: number;
  label?: string;
}) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      {label && (
        <span className="text-[11px] text-muted-foreground">{label}</span>
      )}
    </div>
  );
}
