/** Public announcements are independent of a person's passes and notification consent. */
export const RELEASE_ITEM_TYPES = ["book", "movie", "series"] as const;
export const RELEASE_MODALITIES = ["cinema", "digital", "series", "season", "book", "book_translation"] as const;
export const RELEASE_MARKETS = ["ES", "INT"] as const;
export const RELEASE_DATE_PRECISIONS = ["day", "month", "year", "unknown"] as const;
export const RELEASE_STATUSES = ["draft", "published", "cancelled"] as const;
export type ReleaseItemType = (typeof RELEASE_ITEM_TYPES)[number];
export type ReleaseModality = (typeof RELEASE_MODALITIES)[number];
export type ReleaseMarket = (typeof RELEASE_MARKETS)[number];
export type ReleaseDatePrecision = (typeof RELEASE_DATE_PRECISIONS)[number];
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];
export type ReleaseSource = "tmdb" | "editorial";
export type ReleaseDeliveryReason = "reminder" | "confirmed" | "changed" | "cancelled";

/** date_value preserves YYYY-MM-DD / YYYY-MM / YYYY; unknown is always null. */
export interface CulturalRelease {
  id: string;
  work_key: string;
  source: ReleaseSource;
  source_key: string;
  item_type: ReleaseItemType;
  modality: ReleaseModality;
  season_number: number | null;
  market: ReleaseMarket;
  language: string;
  date_value: string | null;
  date_precision: ReleaseDatePrecision;
  status: ReleaseStatus;
  revision: number;
  checked_at: string | null;
  title: string;
  subtitle: string | null;
  cover_url: string | null;
  synopsis: string | null;
  /** Text language; never the launch/edition language. Absent on legacy notification snapshots. */
  synopsis_language?: string | null;
  author: string | null;
  publisher: string | null;
  isbn: string | null;
  digital_platform: string | null;
  source_name: string;
  source_url: string;
  tmdb_id: number | null;
  book_id: string | null;
  movie_id: string | null;
  series_id: string | null;
  book_edition_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Subscriptions are private even when the profile is public. */
export interface ReleaseSubscription {
  user_id: string;
  release_id: string;
  active: boolean;
  consent_generation: string;
  baseline_revision: number;
  created_at: string;
  updated_at: string;
}

/** A full editorial replacement; identity/link changes require an explicit admin save. */
export interface ReleaseEditorialInput {
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  synopsis?: string | null;
  author?: string | null;
  publisher?: string | null;
  isbn?: string | null;
  modality: "book" | "book_translation";
  market: ReleaseMarket;
  language: string;
  dateValue: string | null;
  datePrecision: ReleaseDatePrecision;
  status: ReleaseStatus;
  sourceName: string;
  sourceUrl: string;
  bookId?: string | null;
  bookEditionId?: string | null;
  /** Only when intentionally grouping a second announcement under an existing work. */
  workKey?: string;
}

/** Canonical server-only TMDB input; release_upsert_tmdb also requires the current source-attempt token. */
export type ReleaseTmdbInput = Omit<CulturalRelease,
  "id" | "source" | "revision" | "created_at" | "updated_at" | "book_id" | "book_edition_id"
  | "author" | "publisher" | "isbn"
>;

export interface ReleaseSourceStatus {
  source: ReleaseSource;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
}

/** Service-only claims. accepted_at is in-app acceptance, never a push receipt. */
export interface ReleaseDeliveryClaim {
  id: string;
  release_id: string;
  user_id: string;
  release_revision: number;
  reason: ReleaseDeliveryReason;
  consent_generation: string;
  claim_token: string;
  lease_until: string;
  notification_dedupe_key: string;
  release_payload: CulturalRelease;
}

export interface ReleaseDelivery {
  id: string;
  release_id: string;
  user_id: string;
  release_revision: number;
  reason: ReleaseDeliveryReason;
  consent_generation: string;
  state: "pending" | "claimed" | "accepted" | "suppressed";
  available_at: string;
  claim_token: string | null;
  lease_until: string | null;
  attempts: number;
  accepted_at: string | null;
  notification_id: string | null;
  last_error: string | null;
  created_at: string;
}
