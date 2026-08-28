// Piezas puras compartidas por las server actions de portadas oficiales del
// editor de ficha (src/lib/catalog/edit-actions.ts). Aquí no hay fetch ni
// Supabase: solo la allowlist de host y el recorte de la galería, para poder
// testearlas sin red.

export const MAX_OFFICIAL_COVERS = 12;

// Los únicos hosts desde los que se puede fijar cover_url. setOfficialCover se
// llama DIRECTO desde el cliente (la URL es manipulable), así que sin esto
// cualquiera dejaría una URL arbitraria servida en la ficha compartida.
// Portadas oficiales por allowlist de hosts (decisiones.md, 2026-08-02).
// `books.google.com` es el host real de `imageLinks` en la API de Google
// Books (googlebooks/client.ts), verificado con una llamada real durante la
// implementación de esa capa (task 7, 2026-08-27) — no es una suposición.
const ALLOWED_COVER_HOSTS = new Set([
  "image.tmdb.org",
  "covers.openlibrary.org",
  "books.google.com",
]);

export function isAllowedCoverHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_COVER_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

// Deduplica (conservando orden) y corta al tope: TMDB puede devolver decenas de
// posters y nadie elige entre 40 miniaturas.
export function capOfficialCovers(urls: string[]): string[] {
  return [...new Set(urls)].slice(0, MAX_OFFICIAL_COVERS);
}
