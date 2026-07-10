import type { SearchResult } from "./types";
import { normalizeTitle } from "./title-match";

// Las búsquedas de libros devuelven muchas ediciones casi idénticas de la
// misma obra (bolsillo, tapa dura, reediciones…). Se agrupan por obra
// (título normalizado + primer autor) y se muestra una sola tarjeta con la
// edición más completa como representante, anotando cuántas ediciones cubre.
// Ver docs/REQUIREMENTS.md §7.2.

function firstAuthorKey(subtitle: string | null): string {
  if (!subtitle) return "";
  return normalizeTitle(subtitle.split(",")[0] ?? "");
}

function workKey(result: SearchResult): string {
  return `${normalizeTitle(result.title)}|${firstAuthorKey(result.subtitle)}`;
}

// Cuanta más metadata tiene una edición, mejor representante (portada y
// sinopsis pesan más porque son lo que se ve en la tarjeta y la ficha).
function completeness(result: SearchResult): number {
  return (
    (result.coverUrl ? 2 : 0) +
    (result.synopsis ? 2 : 0) +
    (result.pageCount ? 1 : 0) +
    (result.isbn ? 1 : 0) +
    // Un resultado ya cacheado (catalogId) es preferible: evita recrear catálogo.
    (result.catalogId ? 1 : 0)
  );
}

export function groupBookEditions(results: SearchResult[]): SearchResult[] {
  const groups = new Map<string, SearchResult[]>();
  const order: string[] = [];

  for (const result of results) {
    const key = workKey(result);
    const existing = groups.get(key);
    if (existing) {
      existing.push(result);
    } else {
      groups.set(key, [result]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    if (group.length === 1) return group[0];
    // Representante = edición más completa; empate → la primera (orden de la API).
    const best = group.reduce((a, b) => (completeness(b) > completeness(a) ? b : a));
    return { ...best, editionCount: group.length };
  });
}
