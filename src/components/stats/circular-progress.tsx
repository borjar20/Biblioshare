// Server component: an SVG progress ring. Used for the daily-minutes goal and
// the per-type annual goals (docs/REQUIREMENTS.md §7.14). Colors via CSS vars —
// `color` takes a var() expression so each annual ring can wear its media
// type's accent (MEDIA_ACCENT.varName, src/lib/catalog/media-accent.ts).
export function CircularProgress({
  value,
  total,
  label,
  caption,
  size = 84,
  color = "var(--accent)",
  textColor = "var(--foreground)",
}: {
  value: number;
  total: number;
  label: string;
  caption: string;
  size?: number;
  color?: string;
  textColor?: string;
}) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  const offset = circumference * (1 - ratio);

  return (
    <div className="flex shrink-0 items-center gap-3">
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
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div
          className={`absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground ${textColor}`}
        >
          {label}/{caption}
        </div>
      </div>
    </div>
  );
}
