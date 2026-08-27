import type { SearchResult } from "./types";
import { normalizeTitleForComparison } from "./openlibrary/normalize";
import { isSameTitle } from "./title-match";
import { qidFromUri, type InventaireEntity } from "./inventaire/client";

// Colapso por entidad de Wikidata (spec 2026-08-26 §6). OpenLibrary cataloga
// cada traducción como un work distinto — «Words of Radiance» (OL16813053W) y
// «Palabras Radiantes» (OL38056408W) no comparten `key` ni idioma, así que
// `mergeByExternalId` (que funde por work key) los deja como dos tarjetas. La
// entidad de Wikidata que trae Inventaire (`wd:Q8034469` para ambos títulos)
// es la única señal que dice que son LA MISMA obra.
//
// Regla de seguridad, no negociable: SIN VERIFICACIÓN DE AUTOR NO HAY COLAPSO.
// Un duplicado visible es recuperable (dos tarjetas de la misma obra); una
// fusión errónea destruye (dos obras distintas se convierten en una y una de
// las dos desaparece de la lista). Por eso `entityQidFor` exige que el autor
// case ANTES de mirar el título, y por eso una entidad sin autor no ancla nada.
//
// PURO: no toca red ni base de datos. Recibe los resultados ya fusionados por
// `mergeByExternalId` y las entidades que trajo `searchInventaireEntities`.

// `subtitle` es la autoría del resultado tal cual la da OpenLibrary: una lista
// separada por comas que puede incluir traductor/ilustrador además del autor
// ("Brandon Sanderson, Rafael Marín"). Se compara persona a persona —nunca la
// cadena entera contra el nombre de la entidad— por dos razones:
// 1. Comparar la cadena entera rompería el caso del traductor: la porción que
//    aporta la autoría real ("Brandon Sanderson") queda por debajo del umbral
//    de longitud de `isSameTitle` una vez diluida por el resto de la lista.
// 2. `isSameTitle` (title-match.ts) ya trae las dos guardas que este módulo
//    necesitaba y no tenía: un nombre que normaliza a vacío (subtítulo de solo
//    puntuación — «—», «...») nunca casa con nada, y la contención entre
//    nombres exige que el más corto sea al menos el 65% del más largo, así que
//    "Ana" ya no casa con "Susana Fortes" solo por ser substring.
function authorsMatch(subtitle: string | null, entity: InventaireEntity): boolean {
  if (!subtitle || entity.authorNames.length === 0) return false;
  const haveNames = subtitle
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (haveNames.length === 0) return false;
  return entity.authorNames.some((name) => haveNames.some((have) => isSameTitle(have, name)));
}

// Busca el QID de la entidad que identifica a `result`. Si el resultado ya
// trae `wikidataId` (viene de `books.wikidata_id`, persistido en una pasada
// anterior), se respeta tal cual: es más fiable que un match de título contra
// los labels de HOY, y así una obra guardada con un título editorial raro
// ("Palabras radiantes (ed. col.)") no pierde su identidad porque no casa con
// ningún label de Inventaire en esta búsqueda.
function entityQidFor(result: SearchResult, entities: InventaireEntity[]): string | null {
  if (result.wikidataId) return result.wikidataId;
  const titles = new Set(
    [result.title, ...(result.altTitles ?? [])]
      .map(normalizeTitleForComparison)
      .filter((t) => t.length > 0)
  );
  for (const entity of entities) {
    const qid = qidFromUri(entity.uri);
    // El autor se comprueba ANTES que el título: es la guarda de seguridad,
    // así que no tiene sentido gastar la comparación de títulos si ya se sabe
    // que no puede fundir.
    if (!qid || !authorsMatch(result.subtitle, entity)) continue;
    const labels = Object.values(entity.labels).map(normalizeTitleForComparison);
    if (labels.some((label) => label.length > 0 && titles.has(label))) return qid;
  }
  return null;
}

export function collapseByWikidata(
  results: SearchResult[],
  entities: InventaireEntity[]
): SearchResult[] {
  // Atajo: sin entidades y sin ningún resultado con QID ya persistido, no hay
  // nada que colapsar — se devuelve la lista tal cual en vez de reconstruirla.
  if (entities.length === 0 && !results.some((r) => r.wikidataId)) return results;

  const out: SearchResult[] = [];
  const byQid = new Map<string, number>(); // qid -> índice en `out`

  for (const result of results) {
    const qid = entityQidFor(result, entities);
    if (!qid) {
      out.push(result);
      continue;
    }
    const tagged = { ...result, wikidataId: qid };
    const twinIndex = byQid.get(qid);
    if (twinIndex === undefined) {
      // Primera vez que se ve este QID: se queda en su posición actual, que ya
      // es "la mejor posición" (el orden de `mergeByExternalId` pone lo local
      // primero). Si un segundo miembro del grupo llega después, hereda esta
      // posición en vez de la suya.
      byQid.set(qid, out.length);
      out.push(tagged);
      continue;
    }
    const twin = out[twinIndex];
    // Superviviente: (1) el que ya tiene fila en catálogo (`catalogId`) — así
    // el clic no crea una fila nueva cuando ya teníamos la obra —, y si
    // empatan en eso, (2) el de más ediciones.
    const winner =
      (twin.catalogId ? 1 : 0) !== (tagged.catalogId ? 1 : 0)
        ? (twin.catalogId ? twin : tagged)
        : (twin.editionCount ?? 0) >= (tagged.editionCount ?? 0) ? twin : tagged;
    const loser = winner === twin ? tagged : twin;
    out[twinIndex] = {
      ...winner,
      wikidataId: qid,
      altTitles: [
        ...new Set([...(winner.altTitles ?? []), ...(loser.altTitles ?? []), winner.title, loser.title]),
      ],
      editionCount: Math.max(winner.editionCount ?? 0, loser.editionCount ?? 0) || undefined,
    };
  }
  return out;
}
