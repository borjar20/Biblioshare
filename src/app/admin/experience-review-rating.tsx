import { RatingDots } from "@/components/ui/rating-dots";

/** Nota (1–10) de una reseña de experiencia dentro del snapshot de moderación; null si no hay. */
export function experienceReviewRating(snapshot: Record<string, unknown> | undefined): number | null {
  const value = snapshot?.rating;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10 ? value : null;
}

/** Nota de solo lectura para el panel de moderación; sin nota no pinta nada. */
export function ExperienceReviewRating({ snapshot }: { snapshot: Record<string, unknown> | undefined }) {
  const rating = experienceReviewRating(snapshot);
  if (rating === null) return null;
  return <div className="flex items-center gap-2 text-sm"><RatingDots value={rating} size="sm" /><span className="text-muted-foreground">{rating}/10</span></div>;
}
