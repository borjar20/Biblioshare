import type { CulturalRelease } from "@/lib/releases/types";

export function releaseFixture(changes: Partial<CulturalRelease> = {}): CulturalRelease {
  return {
    id: "8174f7cd-39ed-40eb-8195-3d3d713a6a01", work_key: "tmdb:movie:123", source: "tmdb", source_key: "movie:123:cinema:ES",
    item_type: "movie", modality: "cinema", season_number: null, market: "ES", language: "und", date_value: "2027-02-14", date_precision: "day",
    status: "published", revision: 1, checked_at: "2026-10-06T10:00:00Z", title: "La misma película", subtitle: null, cover_url: null,
    synopsis: null, author: null, publisher: null, isbn: null, digital_platform: null, source_name: "TMDB", source_url: "https://www.themoviedb.org/movie/123",
    tmdb_id: 123, book_id: null, movie_id: null, series_id: null, book_edition_id: null, created_at: "2026-10-06T10:00:00Z", updated_at: "2026-10-06T10:00:00Z",
    ...changes,
  };
}
