// Fuzzy title comparison shared by book (Open Library) and movie/series (TMDB)
// matching — normalizes accents/case/punctuation and treats containment as a
// match, since editions/subtitles commonly differ only in punctuation.
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isSameTitle(a: string, b: string): boolean {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const [shorter, longer] = normA.length <= normB.length ? [normA, normB] : [normB, normA];
  if (!longer.includes(shorter)) return false;
  // A short title can be a substring of a completely unrelated longer one
  // (e.g. "1984" inside an unrelated directory title, or "Parasite" inside
  // the documentary "Making Parasite") — only accept containment when the
  // two are close enough in length that it's plausibly the same work (an
  // edition subtitle, not a coincidence).
  return shorter.length / longer.length >= 0.65;
}
