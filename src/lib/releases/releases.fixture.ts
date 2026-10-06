import type { CulturalRelease } from "./types";

type Row = Record<string, unknown>;
type DbResult = { data: unknown; error: unknown };
export const releaseTestState = {
  userId: "user-one" as string | null,
  tables: {} as Record<string, Row[]>,
  failures: new Set<string>(),
  reads: [] as Array<{ kind: string; table: string; from?: number; to?: number }>,
  rpcCalls: [] as Array<{ name: string; args: Row }>,
  handlers: new Map<string, (args: Row) => Promise<DbResult> | DbResult>(),
  afterRead: undefined as undefined | ((table: string) => void),
};

export function resetReleaseFixture() {
  releaseTestState.userId = "user-one";
  releaseTestState.tables = { profiles: [{ user_id: "user-one", role: "admin" }], cultural_releases: [], release_subscriptions: [], passes: [], saga_follows: [], saga_items: [], sagas: [], movies: [], series: [], release_deliveries: [], release_sync_state: [
    { source: "tmdb", last_attempt_at: null, last_success_at: null, last_error: null },
    { source: "editorial", last_attempt_at: null, last_success_at: null, last_error: null },
  ] };
  releaseTestState.failures.clear(); releaseTestState.reads = []; releaseTestState.rpcCalls = []; releaseTestState.handlers.clear(); releaseTestState.afterRead = undefined;
}

export function releaseFixture(overrides: Partial<CulturalRelease> = {}): CulturalRelease & Row {
  return { id: "11111111-1111-4111-8111-111111111111", work_key: "editorial:one", source: "editorial", source_key: "one", item_type: "book",
    modality: "book", season_number: null, market: "ES", language: "es", date_value: "2026-10-10", date_precision: "day", status: "published", revision: 1,
    checked_at: "2026-10-06T08:00:00Z", title: "El anuncio", subtitle: null, cover_url: null, synopsis: null, author: "Autora", publisher: "Editorial",
    isbn: null, digital_platform: null, source_name: "Editorial", source_url: "https://publisher.example.test/announcement", tmdb_id: null,
    book_id: "book-one", movie_id: null, series_id: null, book_edition_id: null, created_at: "2026-10-06T08:00:00Z", updated_at: "2026-10-06T08:00:00Z", ...overrides };
}

/** Models external query responses, not SQL permissions or the queue's database implementation. */
export function releaseTestClient(kind = "request") {
  const identity = kind === "request" ? releaseTestState.userId : null;
  let insertCounter = 0;
  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    const orders: Array<{ column: string; ascending: boolean }> = [];
    let selected: string[] | null = null;
    let range: [number, number] | null = null;
    let mode: "select" | "insert" | "update" | "upsert" = "select";
    let incoming: Row[] = [];
    const result = (): DbResult => {
      releaseTestState.reads.push({ kind, table, ...(range ? { from: range[0], to: range[1] } : {}) });
      if (releaseTestState.failures.has(table)) return { data: null, error: new Error(`fixture_${table}_failed`) };
      const all = releaseTestState.tables[table === "pass_reviews" ? "passes" : table] ?? [];
      let rows = all.filter((row) => filters.every((filter) => filter(row)));
      if (mode === "insert") {
        if (table === "passes" && incoming.some((row) => row.is_active === true && all.some((old) => old.is_active === true
          && old.user_id === row.user_id && old.item_type === row.item_type && old.item_id === row.item_id))) {
          return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "passes_one_active"' } };
        }
        rows = incoming.map((row) => ({ id: `insert-${insertCounter++}`, ...row }));
        releaseTestState.tables[table] = [...all, ...rows];
      } else if (mode === "update") {
        rows.forEach((row) => Object.assign(row, incoming[0]));
      } else if (mode === "upsert") {
        rows = incoming.map((row) => {
          const found = all.find((old) => old.source === row.source);
          if (found) { Object.assign(found, row); return found; }
          all.push({ ...row }); return row;
        });
        releaseTestState.tables[table] = all;
      }
      rows = [...rows].sort((left, right) => {
        for (const order of orders) {
          const value = String(left[order.column] ?? "").localeCompare(String(right[order.column] ?? "")) * (order.ascending ? 1 : -1);
          if (value) return value;
        }
        return 0;
      });
      if (range) rows = rows.slice(range[0], range[1] + 1);
      if (selected) rows = rows.map((row) => Object.fromEntries(selected!.map((column) => [column, row[column]])));
      if (mode === "select") releaseTestState.afterRead?.(table);
      return { data: rows, error: null };
    };
    const builder = {
      select(columns = "*") { selected = columns === "*" ? null : columns.split(",").map((column) => column.trim()); return builder; },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return builder; },
      is(column: string, value: unknown) { filters.push((row) => row[column] === value); return builder; },
      in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return builder; },
      order(column: string, options?: { ascending?: boolean }) { orders.push({ column, ascending: options?.ascending !== false }); return builder; },
      range(first: number, last: number) { range = [first, last]; return builder; },
      limit(count: number) { range = [0, count - 1]; return builder; },
      insert(rows: Row | Row[]) { mode = "insert"; incoming = Array.isArray(rows) ? rows : [rows]; return builder; },
      update(row: Row) { mode = "update"; incoming = [row]; return builder; },
      upsert(row: Row | Row[]) { mode = "upsert"; incoming = Array.isArray(row) ? row : [row]; return builder; },
      async maybeSingle() { const value = result(); return { ...value, data: Array.isArray(value.data) ? value.data[0] ?? null : null }; },
      async single() { return builder.maybeSingle(); },
      then(resolve: (value: DbResult) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return builder;
  }
  return {
    from,
    auth: { getUser: async () => ({ data: { user: identity ? { id: identity } : null }, error: null }) },
    async rpc(name: string, args: Row = {}) { releaseTestState.rpcCalls.push({ name, args }); return releaseTestState.handlers.get(name)?.(args) ?? { data: null, error: new Error(`unexpected_rpc:${name}`) }; },
  };
}
