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

// Valida el dígito de control de un ISBN ya normalizado (ver normalizeIsbn
// arriba). Sirve para descartar ISBN con formato correcto pero dígitos
// inventados o mal transcritos (p. ej. al filtrar ediciones de OpenLibrary).
export function isValidIsbnCheckDigit(isbn: string): boolean {
  if (/^\d{13}$/.test(isbn)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) {
      const digit = Number(isbn[i]);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    return sum % 10 === 0;
  }

  if (/^\d{9}[\dX]$/.test(isbn)) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += Number(isbn[i]) * (10 - i);
    }
    const last = isbn[9] === "X" ? 10 : Number(isbn[9]);
    sum += last;
    return sum % 11 === 0;
  }

  return false;
}
