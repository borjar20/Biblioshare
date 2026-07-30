import type { ItemType } from "@/lib/catalog/types";

// Única verdad sobre la forma de un género. Lista CERRADA y curada: ambas fuentes
// (OpenLibrary vía genres.ts, TMDB vía tmdb-genres.ts) mapean a estas entradas, y
// lo que no mapea se descarta. Se guarda la `label` en genres text[]; el `slug`
// solo se usa para URLs (/genero/[slug]). Regla dura: la `label` de cada entrada
// debe coincidir CARÁCTER A CARÁCTER con la que emite genres.ts para el mismo
// género (test de invariante en genres.test.ts) — por eso los libros no necesitan
// backfill.
export type GenreDef = {
  slug: string; // estable, URL-safe
  label: string; // display, español
  appliesTo: ItemType[];
};

const B: ItemType[] = ["book"];
const MV: ItemType[] = ["movie", "series"];
const ALL: ItemType[] = ["book", "movie", "series"];

export const GENRES: GenreDef[] = [
  // Ficción compartida / de libro (label idéntica a genres.ts)
  { slug: "ciencia-ficcion", label: "Ciencia ficción", appliesTo: ALL },
  { slug: "distopia", label: "Distopía", appliesTo: B },
  { slug: "realismo-magico", label: "Realismo mágico", appliesTo: B },
  { slug: "novela-negra", label: "Novela negra", appliesTo: B },
  { slug: "true-crime", label: "True crime", appliesTo: B },
  { slug: "thriller", label: "Thriller", appliesTo: ALL },
  { slug: "misterio", label: "Misterio", appliesTo: ALL },
  { slug: "fantasia", label: "Fantasía", appliesTo: ALL },
  { slug: "terror", label: "Terror", appliesTo: ALL },
  { slug: "romance", label: "Romance", appliesTo: ALL },
  { slug: "aventura", label: "Aventura", appliesTo: ALL },
  { slug: "historica", label: "Histórica", appliesTo: B },
  { slug: "politica", label: "Política", appliesTo: ALL },
  { slug: "clasicos", label: "Clásicos", appliesTo: B },
  { slug: "humor", label: "Humor", appliesTo: B },
  { slug: "comic", label: "Cómic", appliesTo: B },
  { slug: "manga", label: "Manga", appliesTo: B },
  { slug: "poesia", label: "Poesía", appliesTo: B },
  { slug: "teatro", label: "Teatro", appliesTo: B },
  { slug: "relatos", label: "Relatos", appliesTo: B },
  { slug: "infantil", label: "Infantil", appliesTo: B },
  { slug: "juvenil", label: "Juvenil", appliesTo: B },
  // No ficción (de libro) — labels idénticas a EXACT_RULES de genres.ts
  { slug: "memorias", label: "Memorias", appliesTo: B },
  { slug: "biografia", label: "Biografía", appliesTo: B },
  { slug: "autoayuda", label: "Autoayuda", appliesTo: B },
  { slug: "historia", label: "Historia", appliesTo: ALL },
  { slug: "filosofia", label: "Filosofía", appliesTo: B },
  { slug: "psicologia", label: "Psicología", appliesTo: B },
  { slug: "economia", label: "Economía", appliesTo: B },
  { slug: "religion", label: "Religión", appliesTo: B },
  { slug: "viajes", label: "Viajes", appliesTo: B },
  { slug: "cocina", label: "Cocina", appliesTo: B },
  { slug: "deporte", label: "Deporte", appliesTo: B },
  { slug: "arte", label: "Arte", appliesTo: B },
  { slug: "ensayo", label: "Ensayo", appliesTo: B },
  { slug: "divulgacion", label: "Divulgación", appliesTo: B },
  // Audiovisual (peli/serie). Fantasía, Ciencia ficción, Misterio, Romance,
  // Terror, Thriller, Aventura, Política ya están arriba con appliesTo ampliado.
  { slug: "accion", label: "Acción", appliesTo: MV },
  { slug: "animacion", label: "Animación", appliesTo: MV },
  { slug: "comedia", label: "Comedia", appliesTo: MV },
  { slug: "drama", label: "Drama", appliesTo: MV },
  { slug: "documental", label: "Documental", appliesTo: MV },
  { slug: "familia", label: "Familia", appliesTo: MV },
  { slug: "western", label: "Western", appliesTo: MV },
  { slug: "belica", label: "Bélica", appliesTo: MV },
  { slug: "crimen", label: "Crimen", appliesTo: MV },
  { slug: "musica", label: "Música", appliesTo: MV },
];

const BY_SLUG = new Map(GENRES.map((g) => [g.slug, g]));
const BY_LABEL = new Map(GENRES.map((g) => [g.label, g]));

export function genreDefForSlug(slug: string): GenreDef | null {
  return BY_SLUG.get(slug) ?? null;
}
export function labelForSlug(slug: string): string | null {
  return BY_SLUG.get(slug)?.label ?? null;
}
export function slugForLabel(label: string): string | null {
  return BY_LABEL.get(label)?.slug ?? null;
}
export function isCanonicalLabel(label: string): boolean {
  return BY_LABEL.has(label);
}
