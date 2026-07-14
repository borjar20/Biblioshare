// Autores como entidad (para las fichas de persona, §7.34). La búsqueda solo da
// el nombre del autor como texto; OpenLibrary aporta la entidad de autor (bio,
// foto, fechas) vía /search/authors + /authors.

export type OpenLibraryAuthor = {
  key: string; // p. ej. "OL23919A"
  name: string;
  bio: string | null;
  photoUrl: string | null;
  birthDate: string | null;
  deathDate: string | null;
};

type AuthorSearchResponse = {
  docs?: Array<{ key?: string; name?: string }>;
};

type AuthorDetailResponse = {
  bio?: string | { value?: string };
  photos?: number[];
  birth_date?: string;
  death_date?: string;
};

// Busca el mejor match por nombre y devuelve su ficha enriquecida, o null si no
// hay coincidencia / la API falla (el llamador degrada a ficha ligera). El match
// es difuso: se toma el primer resultado (el más relevante según OpenLibrary).
export async function resolveOpenLibraryAuthor(
  name: string
): Promise<OpenLibraryAuthor | null> {
  const searchUrl = new URL("https://openlibrary.org/search/authors.json");
  searchUrl.searchParams.set("q", name);

  const searchRes = await fetch(searchUrl, { next: { revalidate: 86400 } });
  if (!searchRes.ok) return null;

  const search: AuthorSearchResponse = await searchRes.json();
  const doc = search.docs?.[0];
  if (!doc?.key) return null;

  const key = doc.key.replace("/authors/", "");
  const matchedName = doc.name ?? name;

  const detailRes = await fetch(`https://openlibrary.org/authors/${key}.json`, {
    next: { revalidate: 86400 },
  });
  if (!detailRes.ok) {
    return { key, name: matchedName, bio: null, photoUrl: null, birthDate: null, deathDate: null };
  }

  const detail: AuthorDetailResponse = await detailRes.json();
  const bio =
    typeof detail.bio === "string" ? detail.bio : (detail.bio?.value ?? null);
  const photoId = detail.photos?.find((id) => id > 0);

  return {
    key,
    name: matchedName,
    bio: bio?.trim() || null,
    // Las fotos de autor NO van por el CDN de portadas de libro (/b/id/), sino
    // por /a/id/ — por eso esto no usa buildCoverUrl.
    photoUrl: photoId
      ? `https://covers.openlibrary.org/a/id/${photoId}-M.jpg`
      : null,
    birthDate: detail.birth_date ?? null,
    deathDate: detail.death_date ?? null,
  };
}
