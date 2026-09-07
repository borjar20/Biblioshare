import { isOmnibus, normalizeTitleForComparison, type OpenLibraryAuthorWorkDoc, type WorkIdentityEvidence } from "./normalize";

const WORK_KEY = /^\/works\/OL\d+W$/;
type Work = { key?: string; type?: { key?: string }; location?: string; subjects?: string[] };
type Edition = { key?: string; title?: string; subtitle?: string; works?: { key?: string }[] };

// Only public provider data: no request session or Supabase/RLS data is cached.
async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`https://openlibrary.org${path}`, {
    next: { revalidate: 86400 }, signal,
  });
  if (!response.ok) throw new Error(`Open Library identity: ${response.status}`);
  return response.json();
}

function collectionEdition(edition: Edition): boolean {
  const fullTitle = `${edition.title ?? ""}: ${edition.subtitle ?? ""}`;
  return isOmnibus([edition.title ?? ""]) ||
    (/\b(collection|unboxed)\b/i.test(fullTitle) && fullTitle.split(";").filter((part) => part.trim()).length >= 3);
}

/** Resolve only title bridges and collection conflicts, within one five-second budget. */
export async function fetchWorkIdentityEvidence(docs: OpenLibraryAuthorWorkDoc[]): Promise<WorkIdentityEvidence> {
  const unique = [...new Map(docs.filter((d) => d.key && d.title).map((d) => [d.key!, d])).values()];
  const titles = new Map(unique.map((d) => [d.key!, normalizeTitleForComparison(d.title!)]));
  const collectionKeys = new Set(docs.filter((d) => d.key && !isOmnibus([d.title ?? ""]) &&
    isOmnibus((d.editions?.docs ?? []).map((e) => e.title ?? ""))).map((d) => d.key!));
  const keys = new Set(collectionKeys);
  for (const doc of docs) {
    for (const edition of doc.editions?.docs ?? []) {
      const title = normalizeTitleForComparison(edition.title ?? "");
      if (!title || title === titles.get(doc.key!)) continue;
      for (const [other, workTitle] of titles) {
        if (other !== doc.key && workTitle === title) {
          keys.add(doc.key!);
          keys.add(other);
        }
      }
    }
  }
  const result = new Map<string, { canonicalKey: string; collection: boolean }>();
  const signal = AbortSignal.timeout(5000);
  const queue = [...keys].filter((key) => WORK_KEY.test(key));
  // Four requests at once; cap redirects and edition page size as well.
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length && !signal.aborted) {
      const original = queue.shift()!;
      try {
        let key = original;
        let work: Work | undefined;
        const visited = new Set<string>();
        for (let hop = 0; hop < 4; hop++) {
          if (visited.has(key)) throw new Error("Open Library redirect cycle");
          visited.add(key);
          work = await read<Work>(`${key}.json`, signal);
          if (work.type?.key !== "/type/redirect") break;
          if (!work.location || !WORK_KEY.test(work.location)) throw new Error("Invalid work redirect");
          key = work.location;
        }
        if (work?.type?.key !== "/type/work" || work.key !== key) continue;
        const evidence = { canonicalKey: key, collection: work.subjects?.includes("book set") ?? false };
        result.set(original, evidence);
        if (!evidence.collection && collectionKeys.has(original)) {
          const page = await read<{ size?: number; entries?: Edition[] }>(`${key}/editions.json?limit=100`, signal);
          const editions = page.entries ?? [];
          // Partial pages and a single edition cannot justify removing a work.
          evidence.collection = editions.length >= 2 && page.size === editions.length &&
            new Set(editions.map((e) => e.key)).size === editions.length &&
            editions.every((e) => e.key && e.works?.some((w) => w.key === key) && collectionEdition(e));
        }
      } catch {
        // Keep the original work on missing/contradictory evidence. A completed
        // redirect remains useful even if the subsequent edition lookup fails.
      }
    }
  }));
  return result;
}
