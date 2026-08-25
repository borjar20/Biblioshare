import type { getFeed } from "./feed";

// Doble de Supabase para los tests de `getFeed`. Vive fuera de un `*.test.ts`
// porque lo comparten varios ficheros de test; vitest solo recoge
// `src/**/*.test.ts`, así que este módulo no se ejecuta como suite.
//
// A diferencia de un stub que devuelve listas fijas, este doble APLICA lo que la
// cadena de query pide —`.or()`, `.order()` (todas, en orden) y `.limit()`—
// porque justo ahí vivía el defecto que nadie cubría: un filtro que no coincide
// con lo que acepta `isAfterCursor` gasta el `limit` en filas ya servidas y las
// filas antiguas no se sirven NUNCA. Sin honrar `limit` el test no puede ver ese
// fallo.
//
// El feed lee ahora UNA fuente de contenido, `posts`, mezclada con la actividad
// de club. `.in()` y `.eq()` NO se aplican al servir filas (se registran en
// `inFilters`/`eqFilters`): así el test afirma sobre el filtro EMITIDO —a quién
// se le piden posts (`author_id`), el filtro de kind/anchor_type— sin que el
// doble tenga que modelar follows ni catálogo por id.

export type FakeRow = Record<string, unknown>;

export const FAKE_ACTOR_ID = "actor-1";
export const FAKE_BOOK_ID = "book-1";
export const FAKE_MOVIE_ID = "movie-1";
export const FAKE_SERIES_ID = "series-1";
export const FAKE_CLUB_ID = "club-1";
export const FAKE_SAGA_ID = "saga-1";
export const FAKE_PERSON_ID = "person-1";
// Alias histórico: varios tests usan FAKE_ITEM_ID para el libro.
export const FAKE_ITEM_ID = FAKE_BOOK_ID;

export type FakeFeedSource =
  | "posts"
  | "follows"
  | "profile_identities"
  | "books"
  | "movies"
  | "series"
  | "sagas"
  | "people"
  | "passes"
  | "pass_reviews"
  | "progress_sessions"
  | "episode_watches"
  | "series_episodes"
  | "club_members"
  | "club_activities"
  | "clubs"
  | "interaction_targets"
  | "reactions"
  | "comments"
  | "other";

export type FakeFeedData = {
  /** Filas de `posts` (la fuente de contenido del feed). */
  posts?: FakeRow[];
  /** Filas de `club_activities` (la segunda fuente, columna `created_at`). */
  clubActivities?: FakeRow[];
  /** Filas fuente para display de posts `finished`, por `id` = source_id del post. */
  passes?: FakeRow[];
  passReviews?: FakeRow[];
  /** Filas fuente para display de posts `progressed`. */
  sessions?: FakeRow[];
  /** Filas fuente para display de posts `watched`. */
  episodes?: FakeRow[];
};

export type FakeOrderCall = { column: string; ascending: boolean };

export type FakeFeedSupabase = {
  client: Parameters<typeof getFeed>[0];
  /** Argumento de cada `.or()` recibida, por fuente y en orden de llamada. */
  orFilters: Record<string, string[]>;
  /** Valores de cada `.in(columna, valores)` recibida, por fuente y columna. */
  inFilters: Record<string, Record<string, unknown[]>>;
  /** Valores de cada `.eq(columna, valor)` recibida, por fuente y columna. */
  eqFilters: Record<string, Record<string, unknown>>;
  /** Claves de `.order()` de CADA query, por fuente. */
  orderCalls: Record<string, FakeOrderCall[][]>;
};

// --- Evaluador de filtros PostgREST -----------------------------------------
//
// Se exporta para que los tests comprueben el filtro emitido contra
// `isAfterCursor` con EL MISMO evaluador que el doble usa para servir filas.

/** Parte por comas al nivel superior, respetando los `and(...)` anidados. */
function splitTopLevel(filter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < filter.length; i++) {
    const c = filter[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      parts.push(filter.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(filter.slice(start));
  return parts.filter((p) => p.length > 0);
}

function compare(op: string, left: string, right: string): boolean {
  switch (op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    default:
      throw new Error(`fake-feed-supabase: operador PostgREST no soportado: ${op}`);
  }
}

function matchesClause(row: FakeRow, clause: string): boolean {
  if (clause.startsWith("and(") && clause.endsWith(")")) {
    return splitTopLevel(clause.slice(4, -1)).every((c) => matchesClause(row, c));
  }
  if (clause.startsWith("or(") && clause.endsWith(")")) {
    return splitTopLevel(clause.slice(3, -1)).some((c) => matchesClause(row, c));
  }
  const firstDot = clause.indexOf(".");
  const secondDot = clause.indexOf(".", firstDot + 1);
  if (firstDot < 0 || secondDot < 0) {
    throw new Error(`fake-feed-supabase: cláusula PostgREST ilegible: ${clause}`);
  }
  const column = clause.slice(0, firstDot);
  const op = clause.slice(firstDot + 1, secondDot);
  let value = clause.slice(secondDot + 1);
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  return compare(op, text(row[column]), value);
}

/** ¿Pasa `row` el filtro que se le dio a `.or()`? */
export function rowMatchesOrFilter(row: FakeRow, filter: string): boolean {
  return splitTopLevel(filter).some((clause) => matchesClause(row, clause));
}

function sourceOf(table: string): FakeFeedSource {
  switch (table) {
    case "posts":
    case "follows":
    case "profile_identities":
    case "books":
    case "movies":
    case "series":
    case "sagas":
    case "people":
    case "passes":
    case "pass_reviews":
    case "progress_sessions":
    case "episode_watches":
    case "series_episodes":
    case "club_members":
    case "club_activities":
    case "clubs":
    case "interaction_targets":
    case "reactions":
    case "comments":
      return table;
    default:
      return "other";
  }
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export function fakeSupabase(rows: FakeFeedData = {}): FakeFeedSupabase {
  const posts: FakeRow[] = (rows.posts ?? []).map((r) => ({
    author_id: FAKE_ACTOR_ID,
    kind: "thought",
    anchor_type: "book",
    anchor_id: FAKE_BOOK_ID,
    source_kind: null,
    source_id: null,
    body: "Pensamiento",
    is_spoiler: false,
    ...r,
  }));
  const clubActivities = (rows.clubActivities ?? []).map((r) => ({
    club_id: FAKE_CLUB_ID,
    kind: "lectura",
    status: "active",
    title: "Actividad",
    description: null,
    created_by: FAKE_ACTOR_ID,
    ...r,
  }));
  const passes = rows.passes ?? [];
  const passReviews = rows.passReviews ?? [];
  const sessions = rows.sessions ?? [];
  const episodes = rows.episodes ?? [];

  const orFilters: Record<string, string[]> = {};
  const orderCalls: Record<string, FakeOrderCall[][]> = {};
  const inFilters: Record<string, Record<string, unknown[]>> = {};
  const eqFilters: Record<string, Record<string, unknown>> = {};

  // Un `interaction_target` `kind='post'` por cada post: `getInteractionSummary`
  // (vía `getInteractionTargetRefs`) resuelve el UUID canónico ahí y LANZA si
  // falta, así que sin estas filas el feed no devuelve nada.
  const interactionTargets: FakeRow[] = posts.map((r) => ({
    id: `interaction-target:post:${text(r.id)}`,
    kind: "post",
    source_id: r.id,
    owner_id: r.author_id,
  }));

  // Identidad para CADA autor que aparezca (posts y proponentes de club): un
  // post cuyo autor no resuelve se descarta, así que el roster tiene que
  // cubrir a quien sea que el test use como autor (el visitante incluido).
  const actorIdentities: FakeRow[] = [
    ...new Set([
      FAKE_ACTOR_ID,
      ...posts.map((r) => text(r.author_id)),
      ...clubActivities.map((r) => text(r.created_by)),
    ]),
  ].map((id) => ({ user_id: id, username: `user_${id}`, display_name: null, avatar_url: null }));

  function dataFor(source: FakeFeedSource): FakeRow[] {
    switch (source) {
      case "posts":
        return posts;
      case "interaction_targets":
        return interactionTargets;
      case "passes":
        return passes;
      case "pass_reviews":
        return passReviews;
      case "progress_sessions":
        return sessions;
      case "episode_watches":
        return episodes;
      case "series_episodes":
        return [];
      case "club_members":
        return clubActivities.length ? [{ club_id: FAKE_CLUB_ID }] : [];
      case "club_activities":
        return clubActivities;
      case "clubs":
        return [{ id: FAKE_CLUB_ID, name: "Club", slug: "club", cover_url: null }];
      case "follows":
        return [{ followee_id: FAKE_ACTOR_ID }];
      case "profile_identities":
        return actorIdentities;
      case "books":
        return [{ id: FAKE_BOOK_ID, title: "Título", author: null, cover_url: null, total_pages: null }];
      case "movies":
        return [{ id: FAKE_MOVIE_ID, title: "Peli", cover_url: null }];
      case "series":
        return [{ id: FAKE_SERIES_ID, title: "Serie", cover_url: null }];
      case "sagas":
        return [{ id: FAKE_SAGA_ID, name: "Saga", cover_url: null }];
      case "people":
        return [{ id: FAKE_PERSON_ID, name: "Persona", photo_url: null }];
      case "reactions":
      case "comments":
        return [];
      default:
        return [];
    }
  }

  function query(table: string) {
    const orders: FakeOrderCall[] = [];
    let limit: number | null = null;
    const ors: string[] = [];
    const ins: Array<[string, unknown[]]> = [];
    const eqs: Array<[string, unknown]> = [];
    // `.maybeSingle()` cambia la FORMA de la respuesta: fila o null, no array.
    // Antes se encadenaba y se ignoraba, así que `getPostEvent` —el único
    // llamador que lo usa— recibía un array donde esperaba una fila y no se
    // podía testear desde aquí.
    let single = false;

    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ["neq", "not", "gte"]) {
      builder[method] = chain;
    }
    builder.maybeSingle = () => {
      single = true;
      return builder;
    };
    builder.eq = (column: string, value: unknown) => {
      eqs.push([column, value]);
      return builder;
    };
    builder.in = (column: string, values: unknown[]) => {
      ins.push([column, values]);
      return builder;
    };
    builder.select = () => builder;
    builder.or = (filter: string) => {
      ors.push(filter);
      return builder;
    };
    builder.order = (column: string, opts?: { ascending?: boolean }) => {
      orders.push({ column, ascending: opts?.ascending ?? true });
      return builder;
    };
    builder.limit = (n: number) => {
      limit = n;
      return builder;
    };
    builder.then = (resolve: (value: unknown) => unknown) => {
      const source = sourceOf(table);
      if (ors.length) (orFilters[source] ??= []).push(...ors);
      if (orders.length) (orderCalls[source] ??= []).push(orders);
      for (const [column, values] of ins) (inFilters[source] ??= {})[column] = values;
      for (const [column, value] of eqs) (eqFilters[source] ??= {})[column] = value;

      let result = dataFor(source);
      for (const filter of ors) result = result.filter((r) => rowMatchesOrFilter(r, filter));
      if (orders.length) {
        result = [...result].sort((a, b) => {
          for (const { column, ascending } of orders) {
            const dir = ascending ? -1 : 1;
            const [ka, kb] = [text(a[column]), text(b[column])];
            if (ka !== kb) return ka < kb ? dir : -dir;
          }
          const [ia, ib] = [text(a.id), text(b.id)];
          return ia < ib ? 1 : ia > ib ? -1 : 0;
        });
      }
      if (limit != null) result = result.slice(0, limit);
      if (single) {
        // Los `.eq` solo se APLICAN en el camino `maybeSingle` (el resto de
        // tests se apoyan en `eqFilters` para aseverar QUÉ se pidió, y filtrar
        // de verdad cambiaría lo que hoy devuelven).
        for (const [column, value] of eqs) result = result.filter((r) => text(r[column]) === text(value));
        return resolve({ data: result[0] ?? null, error: null });
      }
      return resolve({ data: result, error: null });
    };
    return builder;
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => query(table),
  };

  return {
    client: client as unknown as Parameters<typeof getFeed>[0],
    orFilters,
    orderCalls,
    inFilters,
    eqFilters,
  };
}
