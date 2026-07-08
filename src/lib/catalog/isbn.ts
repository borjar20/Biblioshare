// Detects whether a search query is an ISBN-10 or ISBN-13 (tolerating
// hyphens/spaces and the trailing X check digit of ISBN-10), so the book
// search can transparently route it as an `isbn:` lookup. See
// docs/REQUIREMENTS.md §7.2.
export function normalizeIsbn(query: string): string | null {
  const trimmed = query.trim();
  if (!/^[0-9Xx\- ]+$/.test(trimmed)) return null;

  const digits = trimmed.replace(/[- ]/g, "");

  if (/^\d{9}[\dXx]$/.test(digits)) {
    return digits.toUpperCase();
  }
  if (/^\d{13}$/.test(digits)) {
    return digits;
  }
  return null;
}
