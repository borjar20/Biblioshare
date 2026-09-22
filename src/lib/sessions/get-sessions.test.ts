import { describe, expect, it } from "vitest";
import { getSessions } from "./get-sessions";

// Doble ligero: aplica de verdad `.eq()`/`.in()` (no solo los registra) porque
// es justo lo que este test verifica -- que `hasPost` sale de cruzar
// `progress_sessions` con los `posts` cuyo `source_kind` es 'progress_session'
// y cuyo `source_id` cae en las sesiones devueltas. Ver session-list.tsx
// (confirma antes de borrar cuando `hasPost` es `true`) y la nota de
// cleanup_source_posts en data-model.md §5.1.
function makeClient(data: {
  sessions?: Record<string, unknown>[];
  posts?: { source_id: string | null }[];
}) {
  function progressSessionsTable() {
    const rows = data.sessions ?? [];
    const builder = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      then(resolve: (value: unknown) => void) {
        resolve({ data: rows, error: null });
      },
    };
    return builder;
  }

  function postsTable() {
    let rows = data.posts ?? [];
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        if (column === "source_kind") rows = rows.filter(() => value === "progress_session");
        return builder;
      },
      in(column: string, values: unknown[]) {
        if (column === "source_id") {
          rows = rows.filter((r) => r.source_id != null && values.includes(r.source_id));
        }
        return builder;
      },
      then(resolve: (value: unknown) => void) {
        resolve({ data: rows, error: null });
      },
    };
    return builder;
  }

  return {
    from(name: string) {
      if (name === "progress_sessions") return progressSessionsTable();
      if (name === "posts") return postsTable();
      throw new Error(`Tabla inesperada: ${name}`);
    },
  };
}

describe("getSessions", () => {
  it("sin passId no consulta nada y devuelve []", async () => {
    const client = makeClient({ sessions: [{ id: "s1" }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getSessions(client as any, null, "book");
    expect(result).toEqual([]);
  });

  it("marca hasPost solo en la sesión con post 'progressed' propio", async () => {
    const client = makeClient({
      sessions: [
        {
          id: "s-con-post",
          session_date: "2026-09-20",
          created_at: "2026-09-20T10:00:00Z",
          duration_minutes: 30,
          position: { page: 120 },
        },
        {
          id: "s-sin-post",
          session_date: "2026-09-19",
          created_at: "2026-09-19T10:00:00Z",
          duration_minutes: null,
          position: { page: 80 },
        },
      ],
      posts: [{ source_id: "s-con-post" }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getSessions(client as any, "pase-1", "book");

    expect(result.find((s) => s.id === "s-con-post")?.hasPost).toBe(true);
    expect(result.find((s) => s.id === "s-sin-post")?.hasPost).toBe(false);
  });

  it("sin sesiones no consulta posts y devuelve []", async () => {
    const client = makeClient({ sessions: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getSessions(client as any, "pase-1", "book");
    expect(result).toEqual([]);
  });
});
