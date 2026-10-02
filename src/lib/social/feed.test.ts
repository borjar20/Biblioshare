import { describe, expect, test, vi } from "vitest";

// `get-interaction-summary.ts` (el lector que se separó de `interactions.ts`
// en F1-027) lleva `server-only`, que en entorno node lanza al importarse.
vi.mock("server-only", () => ({}));

// Mismo motivo que en interactions.test.ts (F1-027): `getInteractionSummary`
// —al que llega el feed— lee la sesión con `getCurrentUser()`, no del cliente
// inyectado. `null` reproduce lo que devolvía el falso: estos casos comprueban
// el feed, no el «yo reaccioné».
vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  getCurrentUser: async () => null,
}));

import { getFeed, getPostEvent, isExperienceEvent, type FeedEntry, type FeedEvent } from "./feed";
import { isAfterCursor, parseCursor } from "./feed-order";
import {
  fakeSupabase,
  rowMatchesOrFilter,
  type FakeRow,
  FAKE_ACTOR_ID,
  FAKE_BOOK_ID,
  FAKE_MOVIE_ID,
  FAKE_SERIES_ID,
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
    expect(e.reviewIsSpoiler).toBe(false);
    // readingDays = finished-started+1 = 8 días.
    expect(e.reviewMeta?.readingDays).toBe(8);
  });

  test("una reseña marcada spoiler llega al evento con reviewIsSpoiler", async () => {
    const sb = fakeSupabase({
      posts: [post("p1", "2026-08-09T10:00:00+00:00", {
        kind: "finished", source_kind: "pass", source_id: "pass-1", anchor_type: "book", anchor_id: FAKE_BOOK_ID,
      })],
      passes: [{ id: "pass-1", rating: 4, started_on: null, finished_on: "2026-08-08" }],
      passReviews: [{ id: "pass-1", review: "Al final muere", review_is_spoiler: true }],
    });
    const [e] = personEvents((await getFeed(sb.client, VIEWER, {})).events);
    expect(e.reviewExcerpt).toBe("Al final muere");
    expect(e.reviewIsSpoiler).toBe(true);
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

  test("un progreso de SERIE => episode desde la posición, sin minutos", async () => {
    // Regresión: los posts 'progressed' de serie caían a "0 minutos registrados"
    // porque el feed solo miraba `position.page`. La posición de serie guarda
    // {season, episode} (episodio más alto de la sesión) y se pinta "S#E#".
    const sb = fakeSupabase({
      posts: [post("p1", "2026-08-09T10:00:00+00:00", {
        kind: "progressed", source_kind: "progress_session", source_id: "sess-1",
        anchor_type: "series", anchor_id: FAKE_SERIES_ID,
      })],
      sessions: [{ id: "sess-1", duration_minutes: null, position: { season: 3, episode: 7 } }],
    });
    const [e] = personEvents((await getFeed(sb.client, VIEWER, {})).events);
    expect(e.kind).toBe("progressed");
    expect(e.episode).toEqual({ season: 3, episode: 7, title: null });
    expect(e.progress?.page).toBeNull();
    expect(e.progress?.durationMinutes).toBeNull();
  });

  test("un 'watched' es el día de una serie: episodio del que cuelga y cuántos hubo ese día", async () => {
    // Fase 4 de series: un post por serie y día (autopost-watched.ts), colgado
    // del primer episodio; la tarjeta cuenta los del MISMO autor, serie y día.
    const ep = (id: string, episode: number, watchedOn: string) => ({
      id, user_id: FAKE_ACTOR_ID, series_id: FAKE_SERIES_ID, season_number: 2, episode_number: episode,
      rating: null, review: null, watched_on: watchedOn,
    });
    const sb = fakeSupabase({
      posts: [post("p1", "2026-09-23T21:00:00+00:00", {
        kind: "watched", source_kind: "episode_watch", source_id: "w1",
        anchor_type: "series", anchor_id: FAKE_SERIES_ID,
      })],
      episodes: [ep("w1", 4, "2026-09-23"), ep("w2", 5, "2026-09-23"), ep("w3", 6, "2026-09-23"), ep("w0", 3, "2026-09-22")],
    });
    const [e] = personEvents((await getFeed(sb.client, VIEWER, {})).events);
    expect(e.kind).toBe("watched");
    expect(e.episode).toEqual({ season: 2, episode: 4, title: null });
    expect(e.episodeCount).toBe(3);
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

describe("getPostEvent — la ruta propia del post sirve la reseña ENTERA", () => {
  // Regresión: `/post/[id]` reusa `resolvePostDrafts` con el feed, así que una
  // reseña larga salía cortada a 200 caracteres con "…" TAMBIÉN en su propia
  // página — y como ninguna tarjeta tiene "ver más", no había forma de leerla
  // entera en ningún sitio. El extracto es cosa del feed; la ruta del post no.
  const RESENA = `Primer párrafo con su idea.\n\nSegundo párrafo que remata y que se alarga${" y se alarga".repeat(20)}.`;

  function fixture() {
    return fakeSupabase({
      posts: [post("p1", "2026-08-09T10:00:00+00:00", {
        kind: "finished", source_kind: "pass", source_id: "pass-1", anchor_type: "book", anchor_id: FAKE_BOOK_ID,
      })],
      passes: [{ id: "pass-1", rating: 4, started_on: "2026-08-01", finished_on: "2026-08-08" }],
      passReviews: [{ id: "pass-1", review: RESENA }],
    });
  }

  test("el feed sigue sirviendo el extracto de 200 caracteres", async () => {
    expect(RESENA.length).toBeGreaterThan(200); // el caso pierde sentido si no
    const [e] = personEvents((await getFeed(fixture().client, VIEWER, {})).events);
    expect(e.reviewExcerpt).toMatch(/…$/);
    expect(e.reviewExcerpt!.length).toBeLessThanOrEqual(201);
  });

  test("/post/[id] sirve el texto completo, con sus saltos de línea", async () => {
    const result = await getPostEvent(fixture().client, VIEWER, "p1");
    const event=result?.event;if(!event||isExperienceEvent(event))throw new Error("Expected catalog post");
    expect(event.reviewExcerpt).toBe(RESENA);
    // El salto de párrafo llega intacto al componente: la separación de
    // párrafos es del autor, no ruido que se pueda colapsar.
    expect(event.reviewExcerpt).toContain("\n\n");
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

describe("getFeed — visionados conjuntos (#1220)", () => {
  const ANA = "ana";
  const LUIS = "luis";

  function jointData(extra: { withJointPost?: boolean; hiddenTotal?: number } = {}) {
    const withJointPost = extra.withJointPost ?? true;
    return {
      posts: [
        ...(withJointPost
          ? [post("pj", "2026-09-26T12:00:00+00:00", {
              kind: "joint", source_kind: "joint_viewing", source_id: "jv-1",
              anchor_type: "movie", anchor_id: FAKE_MOVIE_ID, body: null,
            })]
          : []),
        post("pf", "2026-09-26T11:00:00+00:00", {
          author_id: ANA, kind: "finished", source_kind: "pass", source_id: "pass-ana",
          anchor_type: "movie", anchor_id: FAKE_MOVIE_ID, body: null,
        }),
      ],
      passes: [
        { id: "pass-ana", rating: 8, started_on: null, finished_on: "2026-09-25" },
        { id: "pass-luis", rating: 6, started_on: null, finished_on: "2026-09-25" },
      ],
      passReviews: [
        { id: "pass-ana", review: "Nos encantó", review_is_spoiler: false },
        { id: "pass-luis", review: "El final se hace largo", review_is_spoiler: true },
      ],
      jointViewings: [{ id: "jv-1", watched_on: "2026-09-25" }],
      jointMembers: [
        { viewing_id: "jv-1", user_id: ANA, pass_id: "pass-ana", status: "accepted", responded_at: "2026-09-26T10:00:00+00:00" },
        { viewing_id: "jv-1", user_id: LUIS, pass_id: "pass-luis", status: "accepted", responded_at: "2026-09-26T10:30:00+00:00" },
      ],
      jointCounts: [{ viewing_id: "jv-1", accepted_count: extra.hiddenTotal ?? 2 }],
    };
  }

  test("un post joint => tarjeta con la nota y la reseña de cada miembro visible", async () => {
    const sb = fakeSupabase(jointData());
    const page = await getFeed(sb.client, VIEWER, {});
    const joint = personEvents(page.events).find((e) => e.kind === "joint");
    expect(joint?.verb).toBe("joint");
    expect(joint?.joint).toEqual({
      viewingId: "jv-1",
      watchedOn: "2026-09-25",
      hiddenCount: 0,
      members: [
        expect.objectContaining({ userId: ANA, rating: 8, reviewExcerpt: "Nos encantó", reviewIsSpoiler: false }),
        expect.objectContaining({ userId: LUIS, rating: 6, reviewExcerpt: "El final se hace largo", reviewIsSpoiler: true }),
      ],
    });
  });

  test("los aceptados que quien mira no ve se cuentan («y N más»), no se nombran", async () => {
    const sb = fakeSupabase(jointData({ hiddenTotal: 3 }));
    const page = await getFeed(sb.client, VIEWER, {});
    const joint = personEvents(page.events).find((e) => e.kind === "joint");
    expect(joint?.joint?.members).toHaveLength(2);
    expect(joint?.joint?.hiddenCount).toBe(1);
  });

  test("el finished suelto de un pase del visionado se oculta en inicio", async () => {
    const sb = fakeSupabase(jointData());
    const page = await getFeed(sb.client, VIEWER, {});
    expect(personEvents(page.events).map((e) => e.postId)).toEqual(["pj"]);
  });

  test("…pero se queda si quien mira no ve el post conjunto", async () => {
    const sb = fakeSupabase(jointData({ withJointPost: false }));
    const page = await getFeed(sb.client, VIEWER, {});
    expect(personEvents(page.events).map((e) => e.postId)).toEqual(["pf"]);
  });

  test("…y se queda en el perfil (feed de actor), que es la actividad de esa persona", async () => {
    const sb = fakeSupabase(jointData());
    const page = await getFeed(sb.client, VIEWER, { actorId: ANA });
    expect(personEvents(page.events).map((e) => e.postId)).toContain("pf");
  });

  test("se piden los posts joint de los visionados en los que están tus seguidos", async () => {
    const data = jointData();
    // Un seguido (FAKE_ACTOR_ID) está en el visionado; quien lo creó, no.
    data.jointMembers.push({ viewing_id: "jv-1", user_id: FAKE_ACTOR_ID, pass_id: "pass-x", status: "accepted", responded_at: "2026-09-26T11:30:00+00:00" });
    const sb = fakeSupabase(data);
    await getFeed(sb.client, VIEWER, {});
    // Los visionados se buscan por los AUTORES del feed (tú + a quién sigues)…
    expect(sb.inFilters.joint_viewing_members?.user_id).toEqual([VIEWER, FAKE_ACTOR_ID]);
    expect(sb.eqFilters.joint_viewing_members?.status).toBe("accepted");
    // …y sus posts joint se piden por visionado, no por autor.
    expect(sb.inFilters.posts?.source_id).toEqual(["jv-1"]);
  });
});
