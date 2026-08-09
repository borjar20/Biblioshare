import { describe, expect, test } from "vitest";
import { getFeed, type FeedEntry, type FeedEvent } from "./feed";
import { isAfterCursor, parseCursor } from "./feed-order";
import {
  fakeSupabase,
  rowMatchesOrFilter,
  type FakeRow,
  FAKE_ACTOR_ID,
  FAKE_BOOK_ID,
  FAKE_MOVIE_ID,
} from "./fake-feed-supabase";

// El feed lee de `posts` (kind = thought|finished|progressed|started|dropped|
// watched) mezclado con la actividad de club, ordenado por fecha de PUBLICACIÓN
// (`created_at`), con cursor keyset trivial `(created_at, id)` y sin agrupación
// (cada post = una tarjeta).

const VIEWER = "viewer-1";

function personEvents(entries: FeedEntry[]): FeedEvent[] {
  return entries.flatMap((e) => (e.source === "person" ? [e.event] : []));
}

function post(id: string, createdAt: string, extra: FakeRow = {}): FakeRow {
  return { id, created_at: createdAt, author_id: FAKE_ACTOR_ID, ...extra };
}

describe("getFeed — fuente `posts`", () => {
  test("sin autores ni clubes => vacío", async () => {
    // Visitante anónimo, no es feed de actor: no hay a quién pedir posts ni
    // clubes que mezclar.
    const sb = fakeSupabase({});
    const page = await getFeed(sb.client, null, {});
    expect(page.events).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  test("un pensamiento => verb thought con cuerpo y ancla, target 'post'", async () => {
    const sb = fakeSupabase({
      posts: [post("p1", "2026-08-09T10:00:00+00:00", { kind: "thought", body: "Qué gran libro", is_spoiler: true })],
    });
    const page = await getFeed(sb.client, VIEWER, {});
    const [e] = personEvents(page.events);
    expect(e.id).toBe("posts:p1");
    expect(e.postId).toBe("p1");
    expect(e.kind).toBe("thought");
    expect(e.verb).toBe("thought");
    expect(e.thought).toEqual({ body: "Qué gran libro", isSpoiler: true, anchor: expect.objectContaining({ type: "book", id: FAKE_BOOK_ID }) });
    expect(e.interactionTarget).toEqual({
      targetType: "post",
      targetId: "p1",
      interactionTargetId: "interaction-target:post:p1",
    });
  });

  test("un terminado con nota y reseña => verb reviewed, rating y excerpt", async () => {
    const sb = fakeSupabase({
      posts: [post("p1", "2026-08-09T10:00:00+00:00", {
        kind: "finished", source_kind: "pass", source_id: "pass-1", anchor_type: "book", anchor_id: FAKE_BOOK_ID,
      })],
      passes: [{ id: "pass-1", rating: 4, started_on: "2026-08-01", finished_on: "2026-08-08" }],
      passReviews: [{ id: "pass-1", review: "Una maravilla de principio a fin" }],
    });
    const page = await getFeed(sb.client, VIEWER, {});
    const [e] = personEvents(page.events);
    expect(e.kind).toBe("finished");
    expect(e.verb).toBe("reviewed");
    expect(e.rating).toBe(4);
    expect(e.reviewExcerpt).toBe("Una maravilla de principio a fin");
    // readingDays = finished-started+1 = 8 días.
    expect(e.reviewMeta?.readingDays).toBe(8);
  });

  test("un terminado sin reseña visible => verb finished/rated, sin excerpt", async () => {
    const sb = fakeSupabase({
      posts: [post("p1", "2026-08-09T10:00:00+00:00", { kind: "finished", source_kind: "pass", source_id: "pass-1" })],
      passes: [{ id: "pass-1", rating: 5, started_on: null, finished_on: "2026-08-08" }],
      passReviews: [], // sin fila = sin reseña visible
    });
    const [e] = personEvents((await getFeed(sb.client, VIEWER, {})).events);
    expect(e.verb).toBe("rated"); // hay nota pero no reseña
    expect(e.reviewExcerpt).toBeNull();
  });

  test("un progreso => la nota sale del cuerpo del post, page desde la sesión", async () => {
    const sb = fakeSupabase({
      posts: [post("p1", "2026-08-09T10:00:00+00:00", {
        kind: "progressed", source_kind: "progress_session", source_id: "sess-1", body: "Voy por la mitad", is_spoiler: false,
      })],
      sessions: [{ id: "sess-1", duration_minutes: 45, position: { page: 150 } }],
    });
    const [e] = personEvents((await getFeed(sb.client, VIEWER, {})).events);
    expect(e.kind).toBe("progressed");
    expect(e.verb).toBe("progressed");
    expect(e.progress).toEqual({ durationMinutes: 45, page: 150, percent: null, note: { body: "Voy por la mitad", isSpoiler: false } });
  });

  test("hito started/dropped => se emite con su kind (sin display extra)", async () => {
    const sb = fakeSupabase({
      posts: [
        post("p1", "2026-08-09T11:00:00+00:00", { kind: "started", source_kind: "pass", source_id: "pass-1" }),
        post("p2", "2026-08-09T10:00:00+00:00", { kind: "dropped", source_kind: "pass", source_id: "pass-2" }),
      ],
    });
    const evs = personEvents((await getFeed(sb.client, VIEWER, {})).events);
    expect(evs.map((e) => [e.kind, e.verb])).toEqual([
      ["started", "started"],
      ["dropped", "dropped"],
    ]);
  });

  test("ancla borrada (obra que no resuelve) => se descarta el evento", async () => {
    const sb = fakeSupabase({
      posts: [post("p1", "2026-08-09T10:00:00+00:00", { anchor_type: "book", anchor_id: "book-inexistente" })],
    });
    expect(personEvents((await getFeed(sb.client, VIEWER, {})).events)).toEqual([]);
  });
});

describe("getFeed — orden y a quién se pide", () => {
  test("posts y clubes se mezclan por created_at descendente", async () => {
    const sb = fakeSupabase({
      posts: [
        post("p1", "2026-08-09T09:00:00+00:00"),
        post("p2", "2026-08-09T15:00:00+00:00"),
      ],
      clubActivities: [{ id: "a1", created_at: "2026-08-09T12:00:00+00:00" }],
    });
    const page = await getFeed(sb.client, VIEWER, {});
    expect(page.events.map((e) => e.id)).toEqual(["posts:p2", "club_activities:a1", "posts:p1"]);
  });

  test("feed personal pide posts del visitante ∪ seguidos", async () => {
    const sb = fakeSupabase({ posts: [post("p1", "2026-08-09T10:00:00+00:00")] });
    await getFeed(sb.client, VIEWER, {});
    expect(sb.inFilters.posts.author_id).toEqual(expect.arrayContaining([VIEWER, FAKE_ACTOR_ID]));
  });

  test("feed de actor pide solo los posts de ESE actor y no mezcla clubes", async () => {
    const sb = fakeSupabase({
      posts: [post("p1", "2026-08-09T10:00:00+00:00")],
      clubActivities: [{ id: "a1", created_at: "2026-08-09T12:00:00+00:00" }],
    });
    const page = await getFeed(sb.client, VIEWER, { actorId: FAKE_ACTOR_ID });
    expect(sb.inFilters.posts.author_id).toEqual([FAKE_ACTOR_ID]);
    expect(page.events.every((e) => e.source === "person")).toBe(true);
  });
});

describe("getFeed — filtros", () => {
  test("reviews => filtra kind=finished y descarta terminados sin reseña", async () => {
    const sb = fakeSupabase({
      posts: [post("p1", "2026-08-09T10:00:00+00:00", { kind: "finished", source_kind: "pass", source_id: "pass-1" })],
      passes: [{ id: "pass-1", rating: 3, started_on: null, finished_on: "2026-08-08" }],
      passReviews: [], // sin reseña => descartado bajo "reviews"
    });
    const page = await getFeed(sb.client, VIEWER, { filter: "reviews" });
    expect(sb.eqFilters.posts.kind).toBe("finished");
    expect(personEvents(page.events)).toEqual([]);
  });

  test("book/screen filtran por anchor_type; clubs no pide posts", async () => {
    const book = fakeSupabase({ posts: [post("p1", "2026-08-09T10:00:00+00:00")] });
    await getFeed(book.client, VIEWER, { filter: "book" });
    expect(book.inFilters.posts.anchor_type).toEqual(["book"]);

    const screen = fakeSupabase({ posts: [post("p1", "2026-08-09T10:00:00+00:00", { anchor_type: "movie", anchor_id: FAKE_MOVIE_ID })] });
    await getFeed(screen.client, VIEWER, { filter: "screen" });
    expect(screen.inFilters.posts.anchor_type).toEqual(["movie", "series"]);

    const clubs = fakeSupabase({
      posts: [post("p1", "2026-08-09T10:00:00+00:00")],
      clubActivities: [{ id: "a1", created_at: "2026-08-09T12:00:00+00:00" }],
    });
    const page = await getFeed(clubs.client, VIEWER, { filter: "clubs" });
    expect(clubs.inFilters.posts).toBeUndefined(); // nunca se consultó `posts`
    expect(page.events.map((e) => e.id)).toEqual(["club_activities:a1"]);
  });
});

describe("getFeed — borrado", () => {
  test("viewerCanDelete: true en post propio, false en ajeno", async () => {
    const sb = fakeSupabase({
      posts: [
        post("p1", "2026-08-09T11:00:00+00:00", { author_id: VIEWER }),
        post("p2", "2026-08-09T10:00:00+00:00", { author_id: FAKE_ACTOR_ID }),
      ],
    });
    const evs = personEvents((await getFeed(sb.client, VIEWER, {})).events);
    const byId = new Map(evs.map((e) => [e.postId, e]));
    expect(byId.get("p1")?.viewerCanDelete).toBe(true);
    expect(byId.get("p2")?.viewerCanDelete).toBe(false); // RPC moderatable => []
  });
});

describe("getFeed — paginación keyset", () => {
  // Genera N posts con created_at estrictamente decreciente y algunos clubes
  // intercalados, luego pagina hasta agotar y comprueba que cada evento sale
  // EXACTAMENTE una vez (ni pérdida ni duplicado) — la clase de fallo que dio
  // #295/#303/#346.
  test("sirve cada evento exactamente una vez paginando hasta agotar", async () => {
    const posts: FakeRow[] = [];
    const clubs: FakeRow[] = [];
    for (let i = 0; i < 25; i++) {
      const stamp = `2026-08-09T${String(23 - i).padStart(2, "0")}:00:00+00:00`;
      posts.push(post(`p${i}`, stamp));
      if (i % 4 === 0) clubs.push({ id: `a${i}`, created_at: `2026-08-09T${String(23 - i).padStart(2, "0")}:30:00+00:00` });
    }
    const sb = fakeSupabase({ posts, clubActivities: clubs });

    const seen: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const page: Awaited<ReturnType<typeof getFeed>> = await getFeed(sb.client, VIEWER, {
        pageSize: 5,
        cursor: cursor ?? undefined,
      });
      seen.push(...page.events.map((e) => e.id));
      cursor = page.nextCursor;
      expect(++guard).toBeLessThan(50); // sin bucle infinito
    } while (cursor);

    const expectedCount = posts.length + clubs.length;
    expect(seen).toHaveLength(expectedCount);
    expect(new Set(seen).size).toBe(expectedCount); // sin duplicados
  });

  test("el filtro `.or()` emitido por `posts` es espejo de isAfterCursor", async () => {
    // Cursor de un post; toda fila que el filtro SQL acepta la acepta también
    // `isAfterCursor`, y viceversa, para el mismo conjunto de filas.
    const rows: FakeRow[] = [
      post("p0", "2026-08-09T12:00:00+00:00"),
      post("p1", "2026-08-09T10:00:00+00:00"),
      post("p2", "2026-08-08T23:00:00+00:00"),
    ];
    const sb = fakeSupabase({ posts: rows });
    const first = await getFeed(sb.client, VIEWER, { pageSize: 1 });
    const cursorStr = first.nextCursor!;
    const cursor = parseCursor(cursorStr);

    // Segunda página: capturar el filtro `.or()` emitido para `posts`.
    const sb2 = fakeSupabase({ posts: rows });
    await getFeed(sb2.client, VIEWER, { pageSize: 1, cursor: cursorStr });
    const orFilter = sb2.orFilters.posts.at(-1)!;

    for (const r of rows) {
      const entry = { orderDate: String(r.created_at), sortDate: String(r.created_at), id: `posts:${r.id}` };
      expect(rowMatchesOrFilter(r, orFilter)).toBe(isAfterCursor(entry, cursor));
    }
  });
});
