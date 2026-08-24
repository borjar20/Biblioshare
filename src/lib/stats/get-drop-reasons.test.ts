import { describe, expect, it } from "vitest";
import { computeDropPoint, computeDropReasons } from "./get-drop-reasons";

describe("motivos de abandono", () => {
  it("cuenta por motivo y deja fuera los que no lo tienen", () => {
    const r = computeDropReasons([
      { dropped_reason: "no_enganchado" },
      { dropped_reason: "no_enganchado" },
      { dropped_reason: "aburrido" },
      { dropped_reason: null },
    ]);
    expect(r.byReason.no_enganchado).toBe(2);
    // El denominador honesto: sin backfill, los abandonos previos al
    // 2026-08-14 tienen motivo NULL. Callarlo haría que 2 de 4 pareciera 2 de 2.
    expect(r.withReason).toBe(3);
    expect(r.total).toBe(4);
  });

  it("los cinco motivos salen siempre, aunque valgan cero", () => {
    // Un cero medido es una respuesta: «nunca lo dejo por aburrimiento» dice
    // tanto como el motivo que más pesa. Omitirlo lo confundiría con un hueco.
    const r = computeDropReasons([{ dropped_reason: "otro" }]);
    expect(Object.keys(r.byReason).sort()).toEqual([
      "aburrido",
      "no_enganchado",
      "no_es_momento",
      "no_esperado",
      "otro",
    ]);
    expect(r.byReason.aburrido).toBe(0);
  });

  it("sin ningún abandono, todo a cero y nada inventado", () => {
    const r = computeDropReasons([]);
    expect(r.total).toBe(0);
    expect(r.withReason).toBe(0);
  });
});

describe("punto de abandono", () => {
  it("calcula el % de avance y el punto de no retorno", () => {
    const r = computeDropPoint([
      { position: { page: 20 }, totalPages: 200 }, // 10 %
      { position: { page: 52 }, totalPages: 200 }, // 26 %
      { position: { page: 88 }, totalPages: 200 }, // 44 %
      { position: { page: 60 }, totalPages: 200 }, // 30 %
      { position: { page: 40 }, totalPages: 200 }, // 20 %
    ]);
    expect(r.averagePercent).toBe(26);
    // Nunca ha abandonado por encima del 44 %: ese es el punto de no retorno.
    expect(r.pointOfNoReturn).toBe(44);
  });

  it("con menos de cinco abandonos medibles NO se afirma el punto de no retorno", () => {
    // Con dos, «nunca has abandonado por encima del 26 %» es ruido, no un
    // hallazgo: el máximo de dos muestras no acota nada.
    const r = computeDropPoint([
      { position: { page: 20 }, totalPages: 200 },
      { position: { page: 52 }, totalPages: 200 },
    ]);
    expect(r.pointOfNoReturn).toBeNull();
    // La media sí: es una descripción de lo medido, no una afirmación de límite.
    expect(r.averagePercent).toBe(18);
  });

  it("un libro sin páginas en ficha no entra en el cálculo, pero se cuenta", () => {
    const r = computeDropPoint([{ position: { page: 20 }, totalPages: null }]);
    expect(r.measured).toBe(0);
    expect(r.unmeasurable).toBe(1);
  });

  it("una position con forma ajena se descarta sin romper", () => {
    // `position` es jsonb y NO se valida en BD (trade-off aceptado, §3 del
    // modelo de datos): puede llegar `{season, episode}` en una fila de libro.
    const r = computeDropPoint([{ position: { season: 2, episode: 5 }, totalPages: 200 }]);
    expect(r.measured).toBe(0);
    expect(r.unmeasurable).toBe(1);
  });

  it("una página imposible se descarta: pasado el final no es un punto de abandono", () => {
    // Pasa con ediciones distintas a la de la ficha. Un 150 % arrastraría la
    // media y rompería el punto de no retorno, que es un máximo.
    const r = computeDropPoint([{ position: { page: 300 }, totalPages: 200 }]);
    expect(r.measured).toBe(0);
    expect(r.unmeasurable).toBe(1);
  });

  it("sin nada medible, la media es null y no cero", () => {
    expect(computeDropPoint([]).averagePercent).toBeNull();
  });
});
