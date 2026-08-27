import { isSameTitle, normalizeTitle } from "./title-match";
import { qidFromUri, type InventaireEntity } from "./inventaire/client";

// Reconciliación de identidad Wikidata para las filas que YA están en el
// catálogo (spec 2026-08-26 §6, Task 15). Hermano de `wikidata-collapse.ts`:
// aquel colapsa tarjetas de BÚSQUEDA antes de que existan filas; este decide
// qué filas EXISTENTES son la misma obra y cuál sobrevive a la fusión.
//
// TODO LO DE ESTE MÓDULO ES PURO: no toca red ni base de datos. La E/S —
// Inventaire, Supabase, `merge_book_into`— vive en
// `scripts/reconcile-wikidata.ts`. Está separado a propósito: la parte que
// decide QUÉ SE BORRA es la que hay que poder probar sin red.
//
// REGLA DE SEGURIDAD, no negociable (spec §6): SIN VERIFICACIÓN DE AUTOR NO HAY
// MATCH; ante la duda, no fusionar. Un duplicado que sobrevive es recuperable;
// una fusión errónea destruye. El catálogo de dev tiene el contraejemplo vivo:
// tres filas tituladas «Dune», una de Frank Herbert, otra de «Brian Herbert,
// Kevin J. Anderson» (las precuelas, OTRA obra) y una con `author` a NULL.
// Fundirlas por título sería exactamente el desastre que esta regla evita.

// `books.author` tiene la misma forma que el `subtitle` de un `SearchResult`:
// la autoría tal cual la da OpenLibrary, una lista separada por comas que puede
// incluir traductor o ilustrador («Brandon Sanderson, Rafael Marín»). Se compara
// persona a persona, nunca la cadena entera contra el nombre de la entidad, por
// las dos razones que ya documenta `wikidata-collapse.ts`: la cadena entera
// diluye al autor real por debajo del umbral de longitud de `isSameTitle`, y
// `isSameTitle` ya trae las dos guardas que hacen falta (un nombre que
// normaliza a vacío —«—», «...»— no casa con nada, y la contención exige que el
// más corto sea el 65% del más largo, así que «Ana» no casa con «Susana
// Fortes»). Escribir aquí un comparador propio con contención bidireccional ha
// sido hallazgo bloqueante DOS veces en este plan: no se hace.
export function authorMatches(author: string | null, entity: InventaireEntity): boolean {
  if (!author || entity.authorNames.length === 0) return false;
  const haveNames = author
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (haveNames.length === 0) return false;
  return entity.authorNames.some((name) => haveNames.some((have) => isSameTitle(have, name)));
}

/**
 * ¿El título de la fila y un label de la entidad nombran a la MISMA obra?
 *
 * Compara **conjuntos de palabras**, no contención de cadenas, y esa es la
 * única diferencia con `isSameTitle` — que es justo por lo que no se reutiliza
 * aquí (ver el bloque de abajo).
 *
 * POR QUÉ NO VALE `isSameTitle` PARA ESTO, que era la versión anterior y
 * BORRABA FILAS. `isSameTitle` acepta la contención cuando el más corto mide
 * ≥65% del más largo. Un marcador de volumen o de parte pegado al título base
 * cae dentro de esa cota, así que el trozo casaba con la obra completa y el
 * barrido proponía `merge_book_into`. Medido contra las filas REALES de dev
 * (2026-08-28) con la entidad real `Q8034469` («Words of Radiance»):
 *
 *   Words of Radiance, Part Two / Words of Radiance   ratio 0.68 → CASABA
 *   The Stormlight Archive 1    / The Stormlight Archive  ratio 0.92 → CASABA
 *   El Señor de los Anillos I   / El Señor de los Anillos           → CASABA
 *   Oathbringer Part Two        / Oathbringer          ratio 0.55 → no, POR POCO
 *
 * Las seis filas `Words of Radiance%` de dev resolvían el mismo QID y
 * `planReconciliation` proponía CINCO fusiones: cinco filas de `books`
 * borradas. Y como las seis comparten `created_at` y tienen cero pases, el
 * desempate por `id` dejaba viva «Part Two» y mataba la fila de la obra
 * completa. Que saltara o no era **cuestión de suerte de longitudes, no de
 * datos** — la lista de arriba lo enseña: el mismo error de tipo cae a un lado
 * o al otro del 0.65 según cuánto mida el título base. Un criterio que decide
 * qué se borra no puede depender de eso.
 *
 * Y DE PROPINA RECUPERA UN FALSO NEGATIVO. «La Biblioteca de Medianoche» (alta
 * manual) contra el label «La biblioteca de la medianoche» NO casaba, y el
 * porqué no era el umbral: el `la` extra va EN MEDIO, así que la contención
 * falla y el 65% ni se llega a consultar (el ratio es 0.90, irrelevante). Por
 * conjuntos, `{la, biblioteca, de, medianoche}` es el mismo a los dos lados.
 *
 * PRECIO ASUMIDO, que es del lado seguro: un subtítulo legítimo deja de casar
 * («Elantris: edición aniversario» ya no resuelve el QID de «Elantris»). Eso
 * produce un `sin-match`, que no escribe nada y no borra nada — el duplicado
 * sobrevive y es recuperable. La regla del spec §6 manda: ante la duda, no
 * fusionar.
 *
 * LOCAL A PROPÓSITO: no se toca `title-match.ts`. Ese `isSameTitle` lo comparten
 * `wikidata-collapse.ts` y el matching de TMDB, donde la tolerancia al subtítulo
 * es lo que se quiere y donde equivocarse NO borra filas. Aquí sí las borra.
 */
export function titleMatchesLabel(title: string, label: string): boolean {
  const tokensA = tokenSet(title);
  const tokensB = tokenSet(label);
  // Un título que normaliza a vacío —puntuación sola («—», «...»), o un
  // alfabeto que `normalizeTitle` no conserva— no casa con nada. Sin esta
  // guarda, dos obras en hebreo se fundirían entre sí por el conjunto vacío.
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  if (tokensA.size !== tokensB.size) return false;
  for (const token of tokensA) if (!tokensB.has(token)) return false;
  return true;
}

function tokenSet(value: string): Set<string> {
  // `normalizeTitle` (title-match.ts) ya deja minúsculas sin acentos y convierte
  // TODO lo que no sea `[a-z0-9]` en espacio, así que «Words of Radiance, Part 1»
  // y «Words of Radiance Part 1» producen el mismo conjunto. Se reutiliza esa
  // normalización —no la comparación— para que este módulo y el resto del
  // catálogo entiendan «acento», «guion» y «coma» igual.
  return new Set(normalizeTitle(value).split(" ").filter(Boolean));
}

function titleMatches(title: string, entity: InventaireEntity): boolean {
  return Object.values(entity.labels).some((label) => titleMatchesLabel(title, label));
}

/**
 * QID de la entidad que identifica a este libro, o `null` si no hay match
 * FIABLE. Recibe las entidades que devolvió `searchInventaireEntities` para el
 * título del libro.
 *
 * Tres filtros, TODOS obligatorios:
 *
 * 1. **Autor** (spec §6). Una entidad cuyo autor no case no es candidata, y un
 *    libro sin `author` no casa con nada.
 *
 * 2. **Título contra los labels** de la entidad, que son multilingües: por eso
 *    «Palabras Radiantes» casa con la entidad de «Words of Radiance» y
 *    «Sombras de Identidad» con la de «Shadows of Self». La comparación es
 *    `titleMatchesLabel` —conjunto de palabras—, NO `isSameTitle`: ver su
 *    cabecera, que es la que impide fundir un trozo con su obra completa.
 *
 * 3. **Ambigüedad = sin match.** Si lo que sobrevive apunta a más de un QID
 *    distinto, no se elige: no hay forma de saber cuál, y equivocarse borra una
 *    fila.
 *
 * POR QUÉ EL TÍTULO ES OBLIGATORIO, que no era el diseño inicial. El
 * pseudocódigo del plan se quedaba con «la primera entidad cuyo autor case», y
 * la primera versión de esta función lo suavizaba: el título solo desempataba
 * cuando había varias candidatas del mismo autor, y con una sola candidata
 * bastaba el autor. La razón para dejar el título suelto era buena sobre el
 * papel —la búsqueda de Inventaire es difusa y casa «La Biblioteca de
 * Medianoche» con «La biblioteca de la medianoche», que `isSameTitle` NO casa—,
 * pero el barrido en seco contra dev (2026-08-27) la desmintió: de 13 fusiones
 * propuestas, **dos eran obras distintas del mismo autor**, y las dos venían por
 * esa puerta:
 *
 *   · «Shadows Beneath» (`/works/OL31714961W`, la antología de Writing Excuses)
 *     se iba a fundir con «Shadows of Self» (`/works/OL17349393W`, la novela de
 *     Nacidos de la Bruma). Distinto libro, mismo autor, títulos parecidos.
 *   · «Das Rad der Zeit 34. Der Traum des Wolfs» (La Rueda del Tiempo) se iba a
 *     fundir con «Words of Radiance» (El Archivo de las Tormentas). Ni siquiera
 *     la misma saga.
 *
 * Un 15% de fusiones erróneas no se compensa con los matches que el filtro
 * pierde: el spec lo deja dicho —«ante la duda, no fusionar; un duplicado que
 * sobrevive es recuperable, una fusión errónea destruye»—. El coste asumido es
 * que un duplicado cuyo título no case con ningún label sobrevive al barrido,
 * que es exactamente el lado por el que hay que fallar.
 *
 * (Y el caso de «La Biblioteca de Medianoche» que motivaba dejar el título
 * suelto ya no se pierde: `titleMatchesLabel` lo casa por conjunto de palabras,
 * así que el filtro obligatorio sale gratis en ese caso.)
 */
export function resolveQid(
  book: { title: string | null; author: string | null },
  entities: InventaireEntity[]
): string | null {
  if (!book.title) return null;
  const candidatas = entities.filter(
    (e) =>
      qidFromUri(e.uri) !== null &&
      authorMatches(book.author, e) &&
      titleMatches(book.title!, e)
  );
  const qids = new Set(candidatas.map((e) => qidFromUri(e.uri)!));
  return qids.size === 1 ? [...qids][0] : null;
}

export type BookRow = {
  id: string;
  title: string | null;
  author: string | null;
  created_at: string;
  wikidata_id: string | null;
  /** Pases (`passes`) que apuntan a este libro. El rastro de usuario que más pesa. */
  passCount: number;
  /**
   * El resto del rastro de usuario: posts, notas, ítems de colección, entradas
   * de biblioteca, ítems de saga… Todo lo que una persona escribió a mano.
   */
  otherTraceCount: number;
};

/**
 * Ganador de una fusión: **la fila con más rastro de usuario, no la más
 * completa**. Es el criterio del precedente del repo (migración `20260870`) y su
 * razón es asimétrica: un dato de catálogo —título, portada, sinopsis, año— se
 * vuelve a bajar de OpenLibrary en la siguiente visita a la ficha; un pase, una
 * reseña o una nota, no. Perder catálogo cuesta una petición HTTP; perder un
 * pase es irreparable.
 *
 * Desempates, en orden:
 *   1. Más **pases**. Es la traza fuerte: lleva progreso, fechas y valoración.
 *   2. Más **rastro restante** (posts, notas, colecciones, biblioteca, sagas).
 *   3. La más **antigua** (`created_at`), y a igualdad el `id` menor para que el
 *      resultado sea determinista y el dry-run coincida con el `--apply`.
 *
 * DESVIACIÓN DECLARADA respecto al brief, que decía «más pases, y a igualdad la
 * más antigua»: se intercala el paso 2. Con dos filas a cero pases, la antigüedad
 * es una moneda al aire, y la que tiene la reseña del usuario puede perfectamente
 * ser la nueva. Cuando ninguna de las dos tiene rastro, el criterio del brief se
 * aplica intacto (los pasos 1 y 2 empatan a cero y decide la antigüedad).
 */
export function chooseWinner(candidates: BookRow[]): BookRow {
  if (candidates.length === 0) throw new Error("chooseWinner: lista vacía");
  return candidates.reduce((best, row) => {
    if (row.passCount !== best.passCount) return row.passCount > best.passCount ? row : best;
    if (row.otherTraceCount !== best.otherTraceCount) {
      return row.otherTraceCount > best.otherTraceCount ? row : best;
    }
    if (row.created_at !== best.created_at) return row.created_at < best.created_at ? row : best;
    return row.id < best.id ? row : best;
  });
}

export type Action =
  | { kind: "sin-match" }
  | { kind: "set-qid" }
  /** Esta fila desaparece: sus referencias se repuntan a `winnerId`. */
  | { kind: "merge-into"; winnerId: string }
  /** Esta fila gana la colisión: sobrevive y absorbe a las demás del grupo. */
  | { kind: "conserva"; loserIds: string[] };

export type PlanEntry = {
  book: BookRow;
  qid: string | null;
  action: Action;
};

/**
 * Convierte «cada libro con su QID resuelto» en la lista de acciones.
 *
 * Los libros que YA tienen `wikidata_id` en la base entran también, con su QID
 * de la base y sin haber preguntado a Inventaire: son dueños preexistentes del
 * QID y tienen que poder participar del grupo — y **perder**, si el criterio de
 * rastro de usuario dice que la fila nueva pesa más. El orden del `--apply` lo
 * resuelve: primero las fusiones (que borran al perdedor y con él su
 * `wikidata_id`), y solo después el `update` del ganador; así el único de
 * `books.wikidata_id` nunca ve dos filas con el mismo valor.
 *
 * Un libro cuyo QID nadie más reclama y que ya lo tiene puesto NO genera acción:
 * no aparece en el plan. Eso hace el barrido idempotente.
 */
export function planReconciliation(resolved: Array<{ book: BookRow; qid: string | null }>): PlanEntry[] {
  const groups = new Map<string, BookRow[]>();
  const sinMatch: PlanEntry[] = [];

  for (const { book, qid } of resolved) {
    if (!qid) {
      sinMatch.push({ book, qid: null, action: { kind: "sin-match" } });
      continue;
    }
    const group = groups.get(qid);
    if (group) group.push(book);
    else groups.set(qid, [book]);
  }

  const out: PlanEntry[] = [];
  for (const [qid, members] of groups) {
    if (members.length === 1) {
      const [only] = members;
      // Ya lo tiene y nadie se lo disputa: nada que hacer, fuera del plan.
      if (only.wikidata_id === qid) continue;
      out.push({ book: only, qid, action: { kind: "set-qid" } });
      continue;
    }
    const winner = chooseWinner(members);
    const losers = members.filter((m) => m.id !== winner.id);
    out.push({ book: winner, qid, action: { kind: "conserva", loserIds: losers.map((l) => l.id) } });
    for (const loser of losers) {
      out.push({ book: loser, qid, action: { kind: "merge-into", winnerId: winner.id } });
    }
  }
  return [...out, ...sinMatch];
}
