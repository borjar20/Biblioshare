const SUFFIXES: Record<string, string> = {
  jr: "junior", junior: "junior", hijo: "junior",
  sr: "senior", senior: "senior", padre: "senior",
  ii: "ii", iii: "iii", iv: "iv",
};
const PARTICLES = new Set(["de", "del", "la", "las", "los", "van", "von", "der", "da", "dos", "di", "du"]);

function words(value: string): string[] {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function person(value: string): { tokens: string[]; suffix: string | null } {
  let text = value.trim().replace(/[.,\s]+$/, "");
  const last = text.match(/([\p{L}\p{N}]+)$/u);
  const suffix = last ? SUFFIXES[last[1].toLowerCase()] ?? null : null;
  if (suffix && last) text = text.slice(0, last.index).replace(/[,\s]+$/, "");
  const parts = text.split(",");
  // A comma inside one person's name denotes family-name-first notation.
  const tokens = words(parts.length === 2 ? `${parts[1]} ${parts[0]}` : text);
  return { suffix, tokens: tokens.filter((word, i) => i === 0 || i === tokens.length - 1 || !PARTICLES.has(word)) };
}

/** Conservative identity check, separate from fuzzy title matching (#922).
 * Full given names and family name must agree. Additional initials may be
 * omitted or expanded; conflicting initials and identity suffixes remain.
 */
export function isSamePersonName(a: string, b: string): boolean {
  const left = person(a);
  const right = person(b);
  const x = left.tokens;
  const y = right.tokens;
  if (!x.length || !y.length || left.suffix !== right.suffix) return false;
  if (x.at(-1) !== y.at(-1)) return false;
  if (x.length === 1 || y.length === 1) return x.length === y.length;
  let i = 0;
  let j = 0;
  let sharedGivenName = false;
  while (i < x.length - 1 && j < y.length - 1) {
    if (x[i] === y[j]) {
      sharedGivenName ||= x[i].length > 1;
      i++; j++;
    }
    else if ((x[i].length === 1 && y[j].startsWith(x[i])) ||
        (y[j].length === 1 && x[i].startsWith(y[j]))) { i++; j++; }
    else if (x[i].length === 1 && y[j].length > 1) i++;
    else if (y[j].length === 1 && x[i].length > 1) j++;
    else return false;
  }
  return (sharedGivenName || x.join(" ") === y.join(" ")) &&
    x.slice(i, -1).every((word) => word.length === 1) &&
    y.slice(j, -1).every((word) => word.length === 1);
}

/** Provider credits can contain several comma-separated full names. */
export function authorListMatchesName(authors: string, name: string): boolean {
  if (isSamePersonName(authors, name)) return true;
  const parts = authors.split(",").map((part) => part.trim());
  // Do not reinterpret "Smith, John" or "John Smith, Jr." as two authors.
  if (parts.some((part) => words(part).length < 2)) return false;
  return parts.some((part) => isSamePersonName(part, name));
}
