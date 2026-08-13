import { normalizeWorkKey } from "./work-detail";
import { pickDisplayName, type OpenLibraryAuthorDetail } from "./author-names";

// La identidad de un autor de libro viene de la OBRA, nunca de su nombre.
//
// Lo que había antes (search/authors.json?q=<nombre> y quedarse con docs[0])
// resolvía "Frank Herbert" a un señor nacido en 1872 que no escribió Dune. La
// clave que da el work no se adivina: es identidad.
//
// LÍMITE CONOCIDO: OL marca a TODOS los autores del work con el mismo
// type "/type/author_role", así que desde aquí es imposible distinguir al autor
// del ilustrador — El nombre del viento lista a Rothfuss y a Marc Simonetti sin
// diferencia alguna. Las ediciones tampoco ayudan: `contributions` vino
// undefined en las 12 ediciones que se probaron. Asumido a propósito.

export type OpenLibraryAuthor = {
  /** Forma corta, la misma que guarda `people.openlibrary_key`: "OL22161A". */
  key: string;
  name: string;
  aliases: string[];
  bio: string | null;
  photoUrl: string | null;
  birthDate: string | null;
  deathDate: string | null;
};

type WorkAuthorsResponse = {
  authors?: Array<{ author?: { key?: string } }>;
};

type AuthorDetailResponse = OpenLibraryAuthorDetail & {
  bio?: string | { value?: string };
  photos?: number[];
  birth_date?: string;
  death_date?: string;
};

const FETCH_TIMEOUT_MS = 5000;
const REVALIDATE_SECONDS = 86400;

function normalizeAuthorKey(key: string): string {
  return key.trim().replace(/^\/?authors\//, "");
}

// Nunca lanza: [] significa "no se pudo saber", y el llamador no escribe
// créditos (mejor sin autor que con uno inventado).
export async function fetchWorkAuthorKeys(workKey: string): Promise<string[]> {
  try {
    const key = normalizeWorkKey(workKey ?? "");
    if (!key) return [];

    const res = await fetch(`https://openlibrary.org/works/${key}.json`, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const data: WorkAuthorsResponse = await res.json();
    const out: string[] = [];
    const seen = new Set<string>();

    for (const entry of data.authors ?? []) {
      const raw = entry?.author?.key;
      if (!raw) continue;
      const authorKey = normalizeAuthorKey(raw);
      if (!authorKey || seen.has(authorKey)) continue;
      seen.add(authorKey);
      out.push(authorKey);
    }

    return out;
  } catch {
    return [];
  }
}

// OpenLibrary devuelve `bio` unas veces como string y otras como { value }.
function parseBio(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "value" in value) {
    const inner = (value as { value?: unknown }).value;
    if (typeof inner === "string") return inner.trim() || null;
  }
  return null;
}

// Nunca lanza. `null` = no se pudo resolver O el autor no tiene ninguna grafía
// latina; en ambos casos el llamador lo omite.
export async function fetchOpenLibraryAuthorByKey(
  key: string
): Promise<OpenLibraryAuthor | null> {
  try {
    const authorKey = normalizeAuthorKey(key ?? "");
    if (!authorKey) return null;

    const res = await fetch(`https://openlibrary.org/authors/${authorKey}.json`, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const detail: AuthorDetailResponse = await res.json();
    const picked = pickDisplayName(detail);
    if (!picked) return null;

    // Las fotos de autor NO van por el CDN de portadas de libro (/b/id/), sino
    // por /a/id/ — por eso esto no usa buildCoverUrl.
    const photoId = detail.photos?.find((id) => id > 0);

    return {
      key: authorKey,
      name: picked.name,
      aliases: picked.aliases,
      bio: parseBio(detail.bio),
      photoUrl: photoId ? `https://covers.openlibrary.org/a/id/${photoId}-M.jpg` : null,
      birthDate: detail.birth_date ?? null,
      deathDate: detail.death_date ?? null,
    };
  } catch {
    return null;
  }
}
