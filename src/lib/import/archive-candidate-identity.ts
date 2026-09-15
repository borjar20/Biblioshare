import type { ImportCandidate } from "./types";

/** Preserve the persisted index used to choose, while deduplicating stable identities. */
export function uniqueArchiveCandidates(candidates: ImportCandidate[]) {
  const external = new Set<string>();
  const local = new Set<string>();
  return candidates.flatMap((candidate, index) => {
    const repeated = (candidate.externalId && external.has(candidate.externalId)) ||
      (candidate.catalogId && local.has(candidate.catalogId));
    if (candidate.externalId) external.add(candidate.externalId);
    if (candidate.catalogId) local.add(candidate.catalogId);
    return repeated ? [] : [{ candidate, index }];
  });
}
