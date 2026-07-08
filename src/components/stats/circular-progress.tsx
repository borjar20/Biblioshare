// Server component: an SVG progress ring. Used for the daily-minutes and
// annual-items goals (docs/REQUIREMENTS.md §7.14). Colors via CSS vars.
export function CircularProgress({
  value,
  total,
  label,
  caption,
  size = 96,
}: {
  value: number;
  total: number;
  label: string;
  caption: string;
  size?: number;
}) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  const offset = circumference * (1 - ratio);

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground">
          {label}
        </div>
      </div>
      <span className="text-sm text-muted-foreground">{caption}</span>
    </div>
  );
}
