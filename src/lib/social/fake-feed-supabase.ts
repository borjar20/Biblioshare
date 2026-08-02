import type { getFeed } from "./feed";

// Doble de Supabase para los tests de `getFeed`. Vive fuera de un `*.test.ts`
// porque lo comparten varios ficheros de test (el de la base del «hace x» y el
// del recorrido de paginación); vitest solo recoge `src/**/*.test.ts`, así que
// este módulo no se ejecuta como suite.
//
// A diferencia de un stub que devuelve listas fijas, este doble APLICA lo que
// la cadena de query pide —`.or()`, `.lte()`, `.order()` (todas, en orden) y
// `.limit()`— porque justo ahí vivía el defecto que nadie cubría: un filtro
// que no coincide con lo que acepta `isAfterCursor` gasta el `limit` en filas
// ya servidas y las filas antiguas no se sirven NUNCA. Sin honrar `limit` el
// test no puede ver ese fallo, y un doble que REGISTRA el filtro sin aplicarlo
// tampoco: mira la cadena, no sus consecuencias.
//
// Además registra el filtro `.or()` de cada fuente (`orFilters`), para poder
// afirmar sobre el filtro emitido y no solo sobre el resultado.
//
// Sirve filas para las CINCO fuentes. Durante un tiempo solo devolvió `added` y
// `diary`, y las otras tres (`progress_sessions`, `episode_watches` y las
// actividades de club) contestaban siempre `[]`: sus cotas se ejercitaban en el
// papel pero ninguna fila pasaba por ellas, así que dos defectos de cota
// —fecha-only y clubes— vivieron con la suite en verde.

export type FakeRow = Record<string, unknown>;

export const FAKE_ACTOR_ID = "actor-1";
export const FAKE_ITEM_ID = "book-1";
export const FAKE_SERIES_ID = "series-1";
export const FAKE_CLUB_ID = "club-1";

// Las dos consultas a `passes` (altas y reseñas) y la de los pases del
// visitante solo se distinguen por las columnas que piden.
export type FakeFeedSource =
  | "added"
  | "diary"
  | "viewerPasses"
  | "progress_sessions"
  | "episode_watches"
  | "follows"
  | "profile_identities"
  | "books"
  | "series"
  | "club_members"
  | "club_activities"
  | "clubs"
  | "interaction_targets"
  | "other";

export type FakeFeedData = {
  /** Filas de la fuente `added` (pases sin `finished_on` en la query de altas). */
  added?: FakeRow[];
  /** Filas de la fuente de reseñas/terminados (`finished_on` no nulo). */
  finished?: FakeRow[];
  /** Filas de `progress_sessions` (fuente `progressed`, columna `session_date`). */
  sessions?: FakeRow[];
  /** Filas de `episode_watches` (columna `watched_on`). */
  episodes?: FakeRow[];
  /** Filas de `club_activities` (la quinta fuente, columna `created_at`). */
  clubActivities?: FakeRow[];
};

export type FakeLteCall = { column: string; value: string };

export type FakeFeedSupabase = {
  client: Parameters<typeof getFeed>[0];
  /** Argumento de cada `.or()` recibida, por fuente y en orden de llamada. */
  orFilters: Record<string, string[]>;
  /** Argumento de cada `.lte()` recibida, por fuente y en orden de llamada. */
  lteCalls: Record<string, FakeLteCall[]>;
};

// --- Evaluador de filtros PostgREST -----------------------------------------
//
// Se exporta para que los tests puedan comprobar el filtro emitido contra
// `isAfterCursor` con EL MISMO evaluador que el doble usa para servir filas: si
// fueran dos, la prueba de equivalencia no diría nada sobre lo que el doble
// hace.
//
// Comparación por cadenas, igual que el resto del doble. Que eso siga
// equivaliendo a Postgres depende de que todos los timestamps lleven el sufijo
// `+00:00` (issue #347).

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

function sourceOf(table: string, columns: string): FakeFeedSource {
  if (table === "passes") {
    if (columns.includes("finished_on")) return "diary";
    if (columns.includes("status")) return "added";
    return "viewerPasses";
  }
  switch (table) {
    case "progress_sessions":
    case "episode_watches":
    case "follows":
    case "profile_identities":
    case "books":
    case "series":
    case "club_members":
    case "club_activities":
    case "clubs":
    case "interaction_targets":
      return table;
    default:
      return "other";
  }
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export function fakeSupabase(rows: FakeFeedData = {}): FakeFeedSupabase {
  const added: FakeRow[] = (rows.added ?? []).map((r) => ({
    user_id: FAKE_ACTOR_ID,
    item_type: "book",
    item_id: FAKE_ITEM_ID,
    status: "reading",
    ...r,
  }));
  const finished: FakeRow[] = (rows.finished ?? []).map((r) => ({
    user_id: FAKE_ACTOR_ID,
    item_type: "book",
    item_id: FAKE_ITEM_ID,
    started_on: null,
    rating: null,
    ...r,
    // Un pase que nunca se ha tocado tras el alta tiene updated_at ==
    // created_at (lo pone el trigger `passes_set_updated_at` solo al UPDATE):
    // ese es el valor por defecto, y el fixture solo lo fija cuando quiere
    // representar un terminado registrado DESPUÉS del alta.
    updated_at: r.updated_at ?? r.created_at,
  }));
  const sessions: FakeRow[] = (rows.sessions ?? []).map((r) => ({
    user_id: FAKE_ACTOR_ID,
    pass_id: "pass-1",
    duration_minutes: 30,
    position: null,
    // El embed `passes!inner(item_type, item_id)` de la query real: sin él
    // `progressedItem` devuelve null y la fila se cae antes de contarse.
    passes: { item_type: "book", item_id: FAKE_ITEM_ID },
    ...r,
  }));
  const episodes: FakeRow[] = (rows.episodes ?? []).map((r) => ({
    user_id: FAKE_ACTOR_ID,
    series_id: FAKE_SERIES_ID,
    season_number: 1,
    episode_number: 1,
    rating: null,
    review: null,
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

  const lteCalls: Record<string, FakeLteCall[]> = {};
  const orFilters: Record<string, string[]> = {};

  // Fila de `interaction_targets` por cada fila fuente que sea target de
  // interacción. `getInteractionSummary` (vía `getInteractionTargetRefs`)
  // resuelve el UUID canónico ahí y LANZA si falta: sin estas filas el feed no
  // llega a devolver nada y ningún test de orden puede afirmar sobre el
  // resultado. La clave del mapa es `kind:source_id`, así que servir todas las
  // clases en cada consulta es inocuo (el doble no aplica `.eq`/`.in`).
  const interactionTargets: FakeRow[] = [
    ...added.map((r) => ({ kind: "pass", source_id: r.id })),
    ...sessions.map((r) => ({ kind: "progress_session", source_id: r.id })),
    ...finished.map((r) => ({ kind: "diary_entry", source_id: r.id })),
    ...episodes.map((r) => ({ kind: "episode_watch", source_id: r.id })),
  ].map((t) => ({ id: `interaction-target:${t.kind}:${text(t.source_id)}`, ...t }));

  function dataFor(source: FakeFeedSource): FakeRow[] {
    switch (source) {
      case "interaction_targets":
        return interactionTargets;
      case "added":
        return added;
      case "diary":
        return finished;
      case "progress_sessions":
        return sessions;
      case "episode_watches":
        return episodes;
      case "club_members":
        return clubActivities.length ? [{ club_id: FAKE_CLUB_ID }] : [];
      case "club_activities":
        return clubActivities;
      case "clubs":
        return [{ id: FAKE_CLUB_ID, name: "Club", slug: "club", cover_url: null }];
      case "series":
        return [{ id: FAKE_SERIES_ID, title: "Serie", cover_url: null }];
      case "follows":
        return [{ followee_id: FAKE_ACTOR_ID }];
      case "profile_identities":
        return [
          {
            user_id: FAKE_ACTOR_ID,
            username: "actor",
            display_name: null,
            avatar_url: null,
          },
        ];
      case "books":
        return [
          {
            id: FAKE_ITEM_ID,
            title: "Título",
            author: null,
            cover_url: null,
            total_pages: null,
          },
        ];
      default:
        return [];
    }
  }

  function query(table: string) {
    let columns = "";
    // TODAS las claves de `.order()`, en el orden en que se piden: la clave del
    // feed son tres columnas y quedarse con la última convertiría el doble en
    // un oráculo distinto del de producción.
    const orders: { column: string; ascending: boolean }[] = [];
    let limit: number | null = null;
    const ltes: FakeLteCall[] = [];
    const ors: string[] = [];

    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ["in", "eq", "neq", "not", "gte", "maybeSingle"]) {
      builder[method] = chain;
    }
    builder.select = (cols: string) => {
      columns = cols;
      return builder;
    };
    builder.lte = (column: string, value: string) => {
      ltes.push({ column, value });
      return builder;
    };
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
      const source = sourceOf(table, columns);
      if (ltes.length) (lteCalls[source] ??= []).push(...ltes);
      if (ors.length) (orFilters[source] ??= []).push(...ors);

      let result = dataFor(source);
      for (const f of ltes) result = result.filter((r) => text(r[f.column]) <= f.value);
      // Varios `.or()` se conjugan con AND entre sí, como en PostgREST.
      for (const filter of ors) result = result.filter((r) => rowMatchesOrFilter(r, filter));
      if (orders.length) {
        result = [...result].sort((a, b) => {
          for (const { column, ascending } of orders) {
            const dir = ascending ? -1 : 1;
            const [ka, kb] = [text(a[column]), text(b[column])];
            if (ka !== kb) return ka < kb ? dir : -dir;
          }
          // Desempate determinista por id para que el doble no dependa del
          // orden de inserción donde Postgres tampoco garantiza uno.
          const [ia, ib] = [text(a.id), text(b.id)];
          return ia < ib ? 1 : ia > ib ? -1 : 0;
        });
      }
      if (limit != null) result = result.slice(0, limit);
      return resolve({ data: result, error: null });
    };
    return builder;
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => query(table),
  };

  return { client: client as unknown as Parameters<typeof getFeed>[0], orFilters, lteCalls };
}
