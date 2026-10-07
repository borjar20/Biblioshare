import { describe, expect, it } from "vitest";
import { releaseFixture } from "./releases.fixture";
import type { ReleaseWork } from "./presentation";
import type { CulturalRelease } from "./types";
import { releaseCalendarState, releaseCalendarPath, releaseCalendarMonths, releaseCalendarMarks, releaseMonthAgenda, releaseUnplacedWorks, releaseMonthCells } from "./calendar";

function work(key: string, rows: Partial<CulturalRelease>[]): ReleaseWork {
  const releases = rows.map((row, i) => releaseFixture({ id: key + "-" + i, work_key: key, item_type: "movie", modality: "cinema", ...row }));
  return { workKey: key, itemType: releases[0].item_type, title: key, subtitle: null, coverUrl: null, catalogId: null, releases };
}
const today = "2026-10-07";
const film = work("film", [{ date_value: "2026-10-09" }, { date_value: "2026-11-13", modality: "digital" }]);
const other = work("other", [{ date_value: "2026-12-11" }]);

describe("calendario de Novedades", () => {
  it("limita cada agenda al mes consultado y conserva todas las modalidades de su obra", () => {
    const october = releaseMonthAgenda([film, other], "2026-10", today);
    expect(october.groups.map((group) => [group.date, group.works.map((entry) => entry.workKey)])).toEqual([["2026-10-09", ["film"]]]);
    expect(october.groups[0].works[0].releases).toBe(film.releases);
    expect(releaseMonthAgenda([film, other], "2026-11", today).groups.map((group) => group.date)).toEqual(["2026-11-13"]);
  });
  it("seleccionar la segunda fecha muestra esa obra una sola vez en el día elegido", () => {
    const multiple = work("multiple", [{ date_value: "2026-10-09" }, { date_value: "2026-10-16", modality: "digital" }]);
    expect(releaseMonthAgenda([multiple], "2026-10", today, "2026-10-16").groups.map((group) => [group.date, group.works.length])).toEqual([["2026-10-16", 1]]);
    expect(releaseMonthAgenda([multiple], "2026-10", today, "2026-10-10").groups).toEqual([]);
  });
  it("el mapa marca cada fecha exacta y deduplica modalidades coincidentes de la misma obra", () => {
    const sameDay = work("same", [{ date_value: "2026-10-09" }, { date_value: "2026-10-09", modality: "digital" }, { date_value: "2026-10-16", modality: "digital" }]);
    const limited = work("limited", [{ date_value: "2026-10-09", item_type: "book", modality: "book" }]);
    expect(releaseCalendarMarks([sameDay], [limited], "2026-10")).toEqual([
      { date: "2026-10-09", main: 1, limited: 1, types: ["movie", "book"], cancelled: 0 },
      { date: "2026-10-16", main: 1, limited: 0, types: ["movie"], cancelled: 0 },
    ]);
    expect(releaseCalendarMarks([film], [], "2026-11")[0].date).toBe("2026-11-13");
  });
  it("un mes parcial pertenece a ese mes sin inventar un día; año y ausencia de fecha quedan accesibles globalmente", () => {
    const partial = work("partial", [{ date_value: "2026-11", date_precision: "month" }]);
    const year = work("year", [{ date_value: "2027", date_precision: "year" }]);
    const unknown = work("unknown", [{ date_value: null, date_precision: "unknown" }]);
    expect(releaseMonthAgenda([partial, year, unknown], "2026-11", today).partial.map((entry) => entry.workKey)).toEqual(["partial"]);
    expect(releaseMonthAgenda([partial], "2026-10", today).partial).toEqual([]);
    expect(releaseMonthAgenda([partial], "2026-11", today, "2026-11-01").partial).toEqual([]);
    expect(releaseUnplacedWorks([partial, year, unknown]).map((entry) => entry.workKey)).toEqual(["year", "unknown"]);
    expect(releaseCalendarMarks([partial, year, unknown], [], "2026-11")).toEqual([]);
    expect(releaseCalendarMonths([film, partial, year, unknown, other])).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
  it("el próximo estreno no se desplaza al aviso histórico y éste sigue gestionable en su mes", () => {
    const personal = work("personal", [{ date_value: "2026-09-01", status: "cancelled" }, { date_value: "2026-10-10", modality: "digital" }]);
    expect(releaseMonthAgenda([personal], "2026-10", today).groups[0].date).toBe("2026-10-10");
    expect(releaseMonthAgenda([personal], "2026-09", today).groups[0].works[0].releases[0].status).toBe("cancelled");
    expect(releaseCalendarMarks([personal], [], "2026-09")[0].cancelled).toBe(1);
  });
  it.each([
    ["mes=2026-11&dia=2026-11-13&vista=limitadas", { month: "2026-11", day: "2026-11-13", view: "limited" }],
    ["mes=2026-02&dia=2026-02-30", { month: "2026-02", day: null, view: "main" }],
    ["mes=2026-11&dia=2026-10-09&vista=invento", { month: "2026-11", day: null, view: "main" }],
    ["mes=2026-99&dia=invento", { month: "2026-10", day: null, view: "main" }],
    ["vista=sin-mes", { month: "2026-10", day: null, view: "undated" }],
  ])("normaliza la URL sin fechas imposibles: %s", (search, expected) => {
    expect(releaseCalendarState(search, today)).toEqual(expected);
  });
  it("un enlace enfocado usa su mes si no hay otro elegido explícitamente", () => {
    expect(releaseCalendarState("", today, "2027-02").month).toBe("2027-02");
    expect(releaseCalendarState("mes=2026-11", today, "2027-02").month).toBe("2026-11");
  });
  it("cambiar mes conserva tipo, mercado, selección y anuncio abierto; borra el día anterior", () => {
    expect(releaseCalendarPath("tipo=movie&mercado=INT&seleccion=personal&lanzamiento=aviso&mes=2026-10&dia=2026-10-09", { month: "2026-11" }))
      .toBe("/novedades?tipo=movie&mercado=INT&seleccion=personal&lanzamiento=aviso&mes=2026-11");
    expect(releaseCalendarPath("mes=2026-10", { day: "2026-10-16", view: "limited" })).toBe("/novedades?mes=2026-10&dia=2026-10-16&vista=limitadas");
  });
  it("la rejilla respeta lunes-domingo, meses bisiestos y relleno fuera del mes", () => {
    const cells = releaseMonthCells("2028-02");
    expect(cells).toHaveLength(35);
    expect(cells[0]).toEqual({ date: "2028-01-31", outside: true });
    expect(cells[29]).toEqual({ date: "2028-02-29", outside: false });
    expect(cells[34]).toEqual({ date: "2028-03-05", outside: true });
  });
});

it("una modalidad cancelada del día sigue anunciada aunque la misma obra tenga otra publicada", () => {
  const mixed = work("mixed-status", [{ date_value: "2026-10-09", status: "cancelled" }, { date_value: "2026-10-09", modality: "digital", status: "published" }]);
  expect(releaseCalendarMarks([mixed], [], "2026-10")[0]).toEqual({ date: "2026-10-09", main: 1, limited: 0, types: ["movie"], cancelled: 1 });
});
