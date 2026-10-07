import type { ReleaseDateParts } from "./precision";

/** An announcement snapshot, without creating any catalog or personal rows. */
export type ReleaseCandidate = ReleaseDateParts & {
  source: "tmdb";
  source_key: string;
  work_key: string;
  item_type: "movie" | "series";
  external_id: string;
  title: string;
  cover_url: string | null;
  synopsis: string | null;
  synopsis_language?: "es" | "en" | null;
  channel: "cinema" | "digital" | "series" | "season";
  season_number: number | null;
  market: "ES" | "INT";
  language: string | null;
  source_url: string;
  platform: null;
};

export type TmdbReleaseDates = {
  results: Array<{
    iso_3166_1: string;
    release_dates: Array<{ type: number; release_date: string; iso_639_1?: string }>;
  }>;
};

export type TmdbScreen = {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  overview?: string;
  first_air_date?: string | null;
  original_language?: string;
  seasons?: Array<{ season_number: number; air_date: string | null; name?: string; poster_path?: string | null }>;
};
