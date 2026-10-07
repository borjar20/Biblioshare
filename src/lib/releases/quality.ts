import type { CulturalRelease } from "./types";

/** Only public HTTPS resources are suitable for cover/source links. */
export function safeReleaseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function releaseCover(releases: CulturalRelease[]): string | null {
  return releases.map((row) => safeReleaseUrl(row.cover_url)).find((value) => value !== null) ?? null;
}

export function releaseSynopsis(releases: CulturalRelease[]): CulturalRelease | undefined {
  return releases.find((row) => Boolean(row.synopsis?.trim()));
}

/** Metadata completeness is independent of date precision, market and consent. */
export function releaseInformationGaps(releases: CulturalRelease[]): Array<"cover" | "synopsis"> {
  const gaps: Array<"cover" | "synopsis"> = [];
  if (!releaseCover(releases)) gaps.push("cover");
  if (!releaseSynopsis(releases)) gaps.push("synopsis");
  return gaps;
}