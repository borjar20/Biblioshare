import type { CulturalRelease } from "@/lib/releases/types";

export { safeReleaseUrl } from "@/lib/releases/quality";

export function releaseWorkHref(release: CulturalRelease): string | null {
  if (release.item_type === "book" && release.book_id) return `/libro/${release.book_id}`;
  if (release.item_type === "movie" && release.movie_id) return `/pelicula/${release.movie_id}`;
  if (release.item_type === "series" && release.series_id) return `/serie/${release.series_id}`;
  return null;
}

export function releaseReviewDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(date);
}

export type ReleaseUserState = Record<string, { subscribed: boolean; inLibrary: boolean }>;
