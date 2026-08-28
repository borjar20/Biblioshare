import type { SearchResult } from "./types";

// La búsqueda por texto SIEMPRE pregunta a la API externa (buscar por título es
// descubrir: cortocircuitar con un hit local, como se hacía antes, escondía el
// resto de obras y congelaba para siempre los datos sucios del catálogo) y
// SIEMPRE mira el catálogo local. Aquí se juntan las dos listas.
//
// La clave de fusión es el `externalId` — la work key de OpenLibrary en libros,
// el id de TMDB en películas y series —, que identifica el ítem en ambas
// fuentes. Lo local va primero: es lo que el usuario ya tiene, y trae catalogId,
// así que añadirlo no crea fila nueva. Un ítem local sin externalId (alta manual,
// import antiguo) no puede fusionarse con nada, pero tampoco se pierde.
export function mergeByExternalId(
  local: SearchResult[],
  api: SearchResult[]
): SearchResult[] {
  const localIds = new Set(
    local.map((result) => result.externalId).filter((id) => id.length > 0)
  );

  return [...local, ...api.filter((result) => !localIds.has(result.externalId))];
}
