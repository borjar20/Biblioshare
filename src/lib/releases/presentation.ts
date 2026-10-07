import type { CulturalRelease, ReleaseItemType, ReleaseMarket, ReleaseModality } from "./types";
import { madridDay } from "./precision";
import { releaseInformationGaps } from "./quality";

export type ReleaseFilters = {
  type?: "all" | ReleaseItemType;
  market?: "all" | ReleaseMarket;
  language?: string;
  modality?: ReleaseModality;
  from?: string;
  to?: string;
  includeUndated?: boolean;
  limit?: number;
  completeness?: "complete" | "limited";
};

export type ReleaseWork = {
  workKey: string;
  itemType: ReleaseItemType;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  catalogId: string | null;
  releases: CulturalRelease[];
};

export function releaseCatalogId(row: CulturalRelease): string | null {
  return row.item_type === "book" ? row.book_id : row.item_type === "movie" ? row.movie_id : row.series_id;
}

/** Exact days and partial/unknown announcements stay in distinct sort groups. */
export function groupReleaseWorks(rows: CulturalRelease[], filters: ReleaseFilters = {}, now = new Date()): ReleaseWork[] {
  const from = filters.from ?? madridDay(now);
  const selected = rows.filter((row) => {
    if (row.status === "draft") return false;
    if (filters.type && filters.type !== "all" && row.item_type !== filters.type) return false;
    if ((filters.market ?? "ES") !== "all" && row.market !== (filters.market ?? "ES")) return false;
    // Default language governs editorial books; TMDB language does not prove dubbing or availability.
    if (row.item_type === "book" && row.language.split("-")[0] !== (filters.language ?? "es").split("-")[0]) return false;
    if (filters.modality && row.modality !== filters.modality) return false;
    if (row.date_precision !== "day") {
      if (filters.includeUndated === false) return false;
      // A known past year/month is past without inventing a release day.
      if (row.date_value && row.date_value < from.slice(0, row.date_value.length)) return false;
      return true;
    }
    return row.date_value !== null && row.date_value >= from && (!filters.to || row.date_value <= filters.to);
  }).sort((a, b) => {
    const precisionRank = (row: CulturalRelease) => row.date_precision === "day" ? 0 : row.date_precision === "unknown" ? 2 : 1;
    return precisionRank(a) - precisionRank(b) || (a.date_value ?? "").localeCompare(b.date_value ?? "") ||
      (a.market === "ES" ? 0 : 1) - (b.market === "ES" ? 0 : 1) || a.id.localeCompare(b.id);
  });
  const workByKey = new Map<string, ReleaseWork>();
  for (const row of selected) {
    const existing = workByKey.get(row.work_key);
    if (existing) {
      existing.releases.push(row);
      existing.catalogId ??= releaseCatalogId(row);
    } else {
      workByKey.set(row.work_key, { workKey: row.work_key, itemType: row.item_type, title: row.title, subtitle: row.subtitle ?? row.author,
        coverUrl: row.cover_url, catalogId: releaseCatalogId(row), releases: [row] });
    }
  }
  const result = [...workByKey.values()].filter((work) => {
    if (!filters.completeness) return true;
    const complete = releaseInformationGaps(work.releases).length === 0;
    return filters.completeness === "complete" ? complete : !complete;
  });
  return filters.limit === undefined ? result : result.slice(0, Math.max(0, Math.floor(filters.limit)));
}

export type ReleaseDayGroup = { date: string; works: ReleaseWork[] };

/** Anchor to the next published day; historical/cancelled notices stay in the same work. */
export function groupReleaseDays(works: ReleaseWork[], now = new Date()): ReleaseDayGroup[] {
  const today = madridDay(now);
  const days = new Map<string, ReleaseWork[]>();
  for (const work of works) {
    const dated = work.releases.filter((row) => row.date_precision === "day" && row.date_value);
    const upcoming = dated.filter((row) => row.status === "published" && row.date_value! >= today);
    const published = dated.filter((row) => row.status === "published");
    const date = (upcoming.length ? upcoming : published.length ? published : dated)
      .map((row) => row.date_value!).sort()[0];
    if (!date) continue;
    const entries = days.get(date) ?? [];
    entries.push(work); days.set(date, entries);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, entries]) => ({ date, works: entries }));
}