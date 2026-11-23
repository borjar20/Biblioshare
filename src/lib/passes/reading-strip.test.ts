import { describe, expect, it } from "vitest";
import type { ProgressSession } from "@/lib/sessions/types";
import type { MarginNoteView } from "@/lib/margin/types";
import type { Note } from "@/lib/notes/types";
import { buildReadingStrip, marginToStrip, noteToStrip, type StripNote } from "./reading-strip";

function s(id: string, date: string, page: number | null, minutes: number | null = 30, createdAt = `${date}T10:00:00Z`): ProgressSession {
  return { id, sessionDate: date, createdAt, durationMinutes: minutes, position: page === null ? {} : { page }, hasPost: false };
}
function n(key: string, page: number | null, createdAt = "2026-08-01T00:00:00Z"): StripNote {
  return { key, kind: "note", page, createdAt };
}
const base = { notes: [] as StripNote[], totalPages: 400, currentPage: null, closed: false, complete: true };

describe("buildReadingStrip — tramos", () => {
  it("ordena por fecha y desempata por creación; la primera parte de 0", () => {
    const strip = buildReadingStrip({ ...base, sessions: [
      s("c", "2026-08-02", 50, 20, "2026-08-02T09:00:00Z"),
      s("a", "2026-07-30", 16),
      s("b", "2026-08-02", 30, 10, "2026-08-02T08:00:00Z"),
    ] });
    expect(strip.segments.map((x) => [x.sessionId, x.index, x.from, x.to, x.pages])).toEqual([
      ["a", 1, 0, 16, 16], ["b", 2, 16, 30, 14], ["c", 3, 30, 50, 20],
    ]);
  });
  it("una sesión que no avanza o retrocede no ocupa ancho, y la siguiente parte de su página", () => {
    const strip = buildReadingStrip({ ...base, sessions: [s("a", "2026-08-01", 40), s("b", "2026-08-02", 40), s("c", "2026-08-03", 35), s("d", "2026-08-04", 60)] });
    expect(strip.segments.map((x) => [x.from, x.to, x.pages, x.advanced])).toEqual([
      [0, 40, 40, true], [40, 40, 0, false], [40, 35, 0, false], [35, 60, 25, true],
    ]);
  });
  it("con historial incompleto, la primera cargada no inventa «desde 0»", () => {
    const strip = buildReadingStrip({ ...base, complete: false, sessions: [s("a", "2026-08-01", 120), s("b", "2026-08-02", 150)] });
    expect(strip.segments.map((x) => [x.from, x.to, x.advanced])).toEqual([[120, 120, false], [120, 150, true]]);
  });
  it("sin sesiones: tira vacía, página actual la del pase", () => {
    const strip = buildReadingStrip({ ...base, sessions: [], currentPage: 12 });
    expect(strip.segments).toEqual([]);
    expect(strip.months).toEqual([]);
    expect(strip.currentPage).toBe(12);
    expect(strip.pagesPerSession).toBe(0);
  });
});

describe("buildReadingStrip — notas", () => {
  const sessions = [s("a", "2026-08-01", 40), s("b", "2026-08-05", 90)];
  it("una nota es de la sesión cuyo tramo la contiene (desde < pág. ≤ hasta)", () => {
    const strip = buildReadingStrip({ ...base, sessions, notes: [n("x", 40), n("y", 41), n("z", 90)] });
    expect(strip.segments[0].notes.map((x) => x.key)).toEqual(["x"]);
    expect(strip.segments[1].notes.map((x) => x.key)).toEqual(["y", "z"]);
  });
  it("por delante de la página actual va a «Más adelante» con el pase abierto, y a «Después de la última sesión» cerrado", () => {
    const open = buildReadingStrip({ ...base, sessions, currentPage: 90, notes: [n("x", 200)] });
    expect(open.loose.ahead.map((x) => x.key)).toEqual(["x"]);
    const closed = buildReadingStrip({ ...base, sessions, currentPage: 90, closed: true, notes: [n("x", 200)] });
    expect(closed.loose.afterLast.map((x) => x.key)).toEqual(["x"]);
    expect(closed.loose.ahead).toEqual([]);
  });
  it("sin página, o sin tramo que la contenga, va a «Otras notas»", () => {
    const strip = buildReadingStrip({ ...base, sessions, notes: [n("sin", null), n("cero", 0)] });
    expect(strip.loose.other.map((x) => x.key)).toEqual(["cero", "sin"]);
  });
  it("dentro de un tramo, por página y a igualdad la más nueva primero", () => {
    const strip = buildReadingStrip({ ...base, sessions, notes: [
      n("vieja", 50, "2026-08-01T00:00:00Z"), n("nueva", 50, "2026-08-03T00:00:00Z"), n("antes", 45),
    ] });
    expect(strip.segments[1].notes.map((x) => x.key)).toEqual(["antes", "nueva", "vieja"]);
  });
  it("si dos tramos contienen la página (se volvió atrás y se releyó), la nota es del más reciente", () => {
    // 0→120, 120→668, vuelta a 120, y 120→240: la página 240 la cubren el
    // segundo y el cuarto tramo; quien escribe una nota en la 240 hoy la
    // escribió en la sesión de hoy.
    const strip = buildReadingStrip({ ...base, totalPages: 669, sessions: [
      s("a", "2026-07-21", 120), s("b", "2026-09-02", 668), s("c", "2026-11-19", 120), s("d", "2026-11-20", 240),
    ], notes: [n("x", 240), n("y", 500)] });
    expect(strip.segments.find((x) => x.sessionId === "d")!.notes.map((x) => x.key)).toEqual(["x"]);
    expect(strip.segments.find((x) => x.sessionId === "b")!.notes.map((x) => x.key)).toEqual(["y"]);
  });
  it("una sesión que no avanza no recibe notas", () => {
    const strip = buildReadingStrip({ ...base, sessions: [s("a", "2026-08-01", 40), s("b", "2026-08-02", 40)], notes: [n("x", 40)] });
    expect(strip.segments[0].notes.map((x) => x.key)).toEqual(["x"]);
    expect(strip.segments[1].notes).toEqual([]);
  });
});

describe("buildReadingStrip — meses, escala y cifras", () => {
  it("agrupa por mes del más reciente al más antiguo, con recuentos y antigüedad", () => {
    const strip = buildReadingStrip({ ...base, notes: [n("x", 10)], sessions: [
      s("a", "2026-07-08", 16, 25), s("b", "2026-07-12", 30, 30), s("c", "2026-08-02", 87, 31),
    ] });
    expect(strip.months.map((m) => [m.key, m.segments.length, m.pages, m.minutes, m.notesCount, m.from, m.to])).toEqual([
      ["2026-08", 1, 57, 31, 0, 30, 87], ["2026-07", 2, 30, 55, 1, 0, 30],
    ]);
    expect(strip.segments.map((x) => x.recency)).toEqual([0, 0, 1]);
    expect(strip.totalMinutes).toBe(86);
    expect(strip.pagesPerSession).toBe(29);
  });
  it("con un solo mes, la antigüedad es 1", () => {
    const strip = buildReadingStrip({ ...base, sessions: [s("a", "2026-08-01", 10)] });
    expect(strip.segments[0].recency).toBe(1);
  });
  it("la escala es el total del libro; sin total, la página alcanzada", () => {
    expect(buildReadingStrip({ ...base, sessions: [s("a", "2026-08-01", 90)] }).scale).toBe(400);
    expect(buildReadingStrip({ ...base, totalPages: null, sessions: [s("a", "2026-08-01", 90)] }).scale).toBe(90);
    expect(buildReadingStrip({ ...base, totalPages: 50, sessions: [s("a", "2026-08-01", 90)] }).scale).toBe(90);
  });
  it("la página actual es la del pase y, sin ella, la de la última sesión", () => {
    expect(buildReadingStrip({ ...base, currentPage: 95, sessions: [s("a", "2026-08-01", 90)] }).currentPage).toBe(95);
    expect(buildReadingStrip({ ...base, sessions: [s("a", "2026-08-01", 90)] }).currentPage).toBe(90);
  });
});

describe("conversión de notas", () => {
  it("noteToStrip toma la página del anclaje", () => {
    const note = { id: "1", kind: "quote", position: { page: 47 }, createdAt: "2026-08-01T00:00:00Z" } as Note;
    expect(noteToStrip(note)).toEqual({ key: "note:1", kind: "quote", page: 47, createdAt: "2026-08-01T00:00:00Z" });
    expect(noteToStrip({ ...note, position: {} } as Note).page).toBeNull();
  });
  it("marginToStrip: ratio → su página; al terminar → el total; episodio → sin página", () => {
    const view = { noteId: "m", createdAt: "2026-08-01T00:00:00Z" } as MarginNoteView;
    expect(marginToStrip({ ...view, anchor: { kind: "ratio", ratio: 0.5, page: 214, pages: 428 } }, 400).page).toBe(214);
    expect(marginToStrip({ ...view, anchor: { kind: "finish" } }, 400).page).toBe(400);
    expect(marginToStrip({ ...view, anchor: { kind: "finish" } }, null).page).toBeNull();
    expect(marginToStrip({ ...view, anchor: { kind: "episode", season: 1, episode: 2 } }, 400)).toEqual({ key: "margin:m", kind: "margin", page: null, createdAt: "2026-08-01T00:00:00Z" });
  });
});
