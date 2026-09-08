import { getMovieDetails } from "@/lib/catalog/tmdb";
import type { ImportCandidate } from "./types";
import { uniqueArchiveCandidates } from "./archive-candidate-identity";

/** Read-only presentation: indexes still address the persisted candidate list. */
export async function prepareArchiveCandidates(candidates: ImportCandidate[]) {
  const unique = uniqueArchiveCandidates(candidates);
  return Promise.all(unique.map(async (choice) => {
    const id = Number(choice.candidate.externalId);
    const details = Number.isSafeInteger(id) && id > 0
      ? await getMovieDetails(id).catch(() => null) : undefined;
    return { ...choice,
      director: details?.credits.filter(c => c.role === "director").map(c => c.name).join(", ") || null,
      runtimeMinutes: details?.runtimeMinutes || null,
      detailsState: details === null ? "failed" as const : "available" as const,
    };
  }));
}
