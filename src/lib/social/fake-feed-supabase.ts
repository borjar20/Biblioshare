import type { getFeed } from "./feed";

// Doble de Supabase para los tests de `getFeed`. Vive fuera de un `*.test.ts`
// porque lo comparten varios ficheros de test (el de la base del «hace x» y el
// del recorrido de paginación); vitest solo recoge `src/**/*.test.ts`, así que
// este módulo no se ejecuta como suite.
//
// A diferencia de un stub que devuelve listas fijas, este doble APLICA lo que
// la cadena de query pide —`.lte()`, `.order()`, `.limit()`— porque justo ahí
// vivía el defecto que nadie cubría: una cota `lte` más ancha de lo que acepta
// `isAfterCursor` gasta el `limit` en filas ya servidas y las filas antiguas no
// se sirven NUNCA. Sin honrar `limit` el test no puede ver ese fallo.
//
// Además registra el argumento de cada `.lte()` por fuente (`lteCalls`), para
// poder afirmar sobre la cota elegida y no solo sobre el resultado.
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
  /** Argumento de cada `.lte()` recibida, por fuente y en orden de llamada. */
  lteCalls: Record<string, FakeLteCall[]>;
};

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
    let orderColumn: string | null = null;
    let ascending = true;
    let limit: number | null = null;
    const ltes: FakeLteCall[] = [];

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
    builder.order = (column: string, opts?: { ascending?: boolean }) => {
      orderColumn = column;
      ascending = opts?.ascending ?? true;
      return builder;
    };
    builder.limit = (n: number) => {
      limit = n;
      return builder;
    };
    builder.then = (resolve: (value: unknown) => unknown) => {
      const source = sourceOf(table, columns);
      if (ltes.length) (lteCalls[source] ??= []).push(...ltes);

      let result = dataFor(source);
      for (const f of ltes) result = result.filter((r) => text(r[f.column]) <= f.value);
      if (orderColumn) {
        const col = orderColumn;
        const dir = ascending ? -1 : 1;
        // Desempate determinista (created_at, id) para que el doble no
        // dependa del orden de inserción donde Postgres tampoco garantiza uno.
        result = [...result].sort((a, b) => {
          const [ka, kb] = [text(a[col]), text(b[col])];
          if (ka !== kb) return ka < kb ? dir : -dir;
          const [ca, cb] = [text(a.created_at), text(b.created_at)];
          if (ca !== cb) return ca < cb ? dir : -dir;
          const [ia, ib] = [text(a.id), text(b.id)];
          return ia < ib ? dir : ia > ib ? -dir : 0;
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

  return { client: client as unknown as Parameters<typeof getFeed>[0], lteCalls };
}
