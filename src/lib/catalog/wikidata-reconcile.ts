import { normalizeTitle } from "./title-match";
import { normalizeTitleForComparison } from "./openlibrary/normalize";
import { authorListMatchesName } from "./person-name";
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

// Provider credits can be a contributor list or a family-name-first name.
// Identity uses the dedicated comparator; fuzzy title containment is unsafe here.
export function authorMatches(author: string | null, entity: InventaireEntity): boolean {
  return Boolean(author && entity.authorNames.some((name) => authorListMatchesName(author, name)));
}

/**
 * Una propuesta de fusión exige igualdad del título normalizado, conservando
 * orden y repeticiones (#921). La búsqueda puede tolerar más; el barrido no.
 * No se cambia el comparador difuso compartido con películas y búsquedas.
 *
 * Baseline de dev (2026-09-06): de las seis filas Words of Radiance*, solo
 * Words of Radiance casa con el label Q8034469; las cinco partes sobreviven.
 * «La Biblioteca de Medianoche» ya no casa automáticamente con «La biblioteca
 * de la medianoche»: ese duplicado exige revisión, no una fusión por conjuntos.
 */
export function titleMatchesLabel(title: string, label: string): boolean {
  const normalized = normalizeTitle(title);
  // El normalizador ASCII compartido puede perder parte de un título mixto.
  // Exigir también la igualdad Unicode de la búsqueda impide que el barrido
  // acepte una identidad que el colapso visual rechazaría.
  return normalized.length > 0 && normalized === normalizeTitle(label) &&
    normalizeTitleForComparison(title) === normalizeTitleForComparison(label);
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
 *    `titleMatchesLabel` —igualdad normalizada—, NO `isSameTitle`: ver su
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
 * El antiguo caso de «La Biblioteca de Medianoche» queda ahora para revisión
 * manual: #921 ya no elimina palabras repetidas para decidir una identidad.
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
