// Buckets a minute count into a short, human Spanish string. Hardcoded
// Spanish rather than routed through next-intl, matching how other
// domain-specific formatting already works in this codebase (e.g.
// BOOK_FORMAT_LABELS/formatPosition in src/lib/library/position.ts).
export function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;

  if (rounded < 24 * 60) {
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }

  if (rounded < 7 * 24 * 60) {
    const days = Math.round(rounded / (24 * 60));
    return `${days} ${days === 1 ? "día" : "días"}`;
  }

  if (rounded < 30 * 24 * 60) {
    const weeks = Math.round(rounded / (7 * 24 * 60));
    return `${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
  }

  const months = Math.round(rounded / (30 * 24 * 60));
  return `${months} ${months === 1 ? "mes" : "meses"}`;
}
