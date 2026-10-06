import { describe, expect, it } from "vitest";
import { experienceDaysIn, loadMoments, pickBestRated, pickPhrase } from "./moments";
import { wrapUpWindow } from "../windows";

const a = { type: "book" as const, id: "a", title: "A", coverUrl: null, times: 1 };
const b = { type: "book" as const, id: "b", title: "B", coverUrl: null, times: 1 };

describe("pickBestRated", () => {
  it("mayor nota; reseña privada o con spoiler no viaja", () => {
    const r = pickBestRated([
      { item_type: "book", item_id: "a", rating: 8, review: "pública", is_public: true, review_is_spoiler: false },
      { item_type: "book", item_id: "b", rating: 10, review: "secreta", is_public: false, review_is_spoiler: false },
    ], [a, b]);
    expect(r).toEqual({ item: b, rating: 10, review: null });
  });
  it("reseña con spoiler tampoco viaja aunque el pase sea público", () => {
    const r = pickBestRated([
      { item_type: "book", item_id: "a", rating: 9, review: "spoiler", is_public: true, review_is_spoiler: true },
    ], [a]);
    expect(r).toEqual({ item: a, rating: 9, review: null });
  });
  it("empate de nota: la terminada más tarde", () => {
    const r = pickBestRated([
      { item_type: "book", item_id: "a", rating: 9, review: null, is_public: true, review_is_spoiler: false, finished_on: "2026-09-02" },
      { item_type: "book", item_id: "b", rating: 9, review: null, is_public: true, review_is_spoiler: false, finished_on: "2026-09-20" },
    ], [a, b]);
    expect(r?.item).toEqual(b);
  });
  it("sin obra en `finished` (fuera de ventana) no sale", () => {
    expect(pickBestRated([{ item_type: "book", item_id: "z", rating: 9, review: null, is_public: true, review_is_spoiler: false }], [a])).toBeNull();
  });
});

describe("pickPhrase", () => {
  it("favorita gana; luego cita sobre nota; recorte a 280", () => {
    const long = "x".repeat(400);
    const p = pickPhrase([
      { source: "note", body: "nota", createdAt: "2026-09-10", item: a, isFavorite: false },
      { source: "quote", body: long, createdAt: "2026-09-05", item: a, isFavorite: false },
    ]);
    expect(p?.source).toBe("quote");
    expect(p?.body.length).toBe(280);
    expect(p?.body.endsWith("…")).toBe(true);
    const fav = pickPhrase([
      { source: "quote", body: "cita", createdAt: "2026-09-10", item: a, isFavorite: false },
      { source: "note", body: "fav", createdAt: "2026-09-01", item: a, isFavorite: true },
    ]);
    expect(fav?.body).toBe("fav");
  });
  it("sin candidatos, null", () => expect(pickPhrase([])).toBeNull());
});

function fakeClient(tables: Record<string, unknown[]>) {
  const calls: { table: string; filters: string[]; select: string; ors: string[] }[] = [];
  const client = {
    from: (table: string) => {
      const entry = { table, filters: [] as string[], select: "", ors: [] as string[] };
      calls.push(entry);
      const q: Record<string, unknown> = {};
      for (const m of ["gte", "lt", "lte", "in", "not", "order", "limit", "is", "range"]) q[m] = () => q;
      q.select = (cols: string) => { entry.select = cols; return q; };
      q.or = (f: string) => { entry.ors.push(f); return q; };
      q.eq = (col: string, v: unknown) => { entry.filters.push(`${col}=${String(v)}`); return q; };
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res);
      return q;
    },
  };
  return { client, calls };
}

const w = wrapUpWindow("month", new Date("2026-10-01T07:00:00Z"));

describe("loadMoments", () => {
  it("toda consulta por usuario filtra por su columna de dueño", async () => {
    const { client, calls } = fakeClient({});
    await loadMoments(client as never, "u1", w, []);
    const owner: Record<string, string> = {
      passes: "user_id", notes: "user_id", margin_notes: "author_id",
      experiences: "creator_id", joint_viewing_members: "user_id", club_posts: "author_id",
    };
    expect(new Set(calls.map((c) => c.table))).toEqual(new Set(Object.keys(owner)));
    for (const c of calls) expect(c.filters).toContain(`${owner[c.table]}=u1`);
  });

  it("solo contenido público y sin spoiler: cada filtro de privacidad está", async () => {
    const { client, calls } = fakeClient({});
    await loadMoments(client as never, "u1", w, []);
    const of = (t: string) => calls.find((c) => c.table === t)!;
    expect(of("notes").filters).toEqual(expect.arrayContaining(["is_public=true", "is_spoiler=false"]));
    expect(of("margin_notes").filters).toEqual(expect.arrayContaining(["audience=followers", "is_spoiler=false"]));
    expect(of("experiences").filters).toEqual(expect.arrayContaining(["audience=profile", "state=lived"]));
    expect(of("joint_viewing_members").select).toContain("joint_viewings!inner");
    expect(of("joint_viewing_members").filters).toContain("status=accepted");
  });

  it("experiencias que solapan la ventana: filtro or de solape", async () => {
    const { client, calls } = fakeClient({});
    await loadMoments(client as never, "u1", w, []);
    expect(calls.find((c) => c.table === "experiences")!.ors)
      .toEqual([`ends_on.gte.${w.start},and(ends_on.is.null,starts_on.gte.${w.start})`]);
  });

  it("junta los hechos: frase, experiencia, días de experiencia y compañía", async () => {
    const { client } = fakeClient({
      passes: [{ item_type: "book", item_id: "a", rating: 9, review: "r", is_public: true, review_is_spoiler: false }],
      notes: [{ kind: "quote", body: "cita", created_at: "2026-09-10T10:00:00Z", is_favorite: false, item_type: "book", item_id: "a" }],
      margin_notes: [],
      experiences: [{ id: "e1", title: "Feria", starts_on: "2026-09-03", ends_on: "2026-09-05" }],
      joint_viewing_members: [{ viewing_id: "v1" }, { viewing_id: "v2" }],
      club_posts: [{ created_at: "2026-09-04T10:00:00Z" }, { created_at: "2026-09-04T18:00:00Z" }, { created_at: "2026-09-06T10:00:00Z" }],
    });
    const f = await loadMoments(client as never, "u1", w, [a]);
    expect(f.bestRated).toEqual({ item: a, rating: 9, review: "r" });
    expect(f.phrase).toEqual({ source: "quote", body: "cita", item: a });
    expect(f.experience).toEqual({ experienceId: "e1", title: "Feria", date: "2026-09-03" });
    expect(f.experienceDays).toBe(3);
    expect(f.together).toEqual({ jointViewings: 2, clubDays: 2 });
  });
});

describe("experienceDaysIn", () => {
  it("empieza 3 días antes y acaba 2 días dentro: cuenta 2 días", () => {
    const win = { start: "2026-09-01", end: "2026-09-30" };
    expect(experienceDaysIn([{ starts_on: "2026-08-29", ends_on: "2026-09-02" }], win)).toBe(2);
  });
  it("sin fin cuenta solo el día de inicio; recorta por el final", () => {
    const win = { start: "2026-09-01", end: "2026-09-30" };
    expect(experienceDaysIn([{ starts_on: "2026-09-10", ends_on: null }, { starts_on: "2026-09-29", ends_on: "2026-10-05" }], win)).toBe(3);
  });
});
