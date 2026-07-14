import { describe, expect, it } from "vitest";
import { latestRatingPerUser } from "./latest-rating";

describe("latestRatingPerUser", () => {
  it("una relectura sustituye el voto de la primera lectura (caso de control: 8 en 2024, 9 en 2026 -> vota 9)", () => {
    const rows = [
      { id: "u1-2024-03-10", userId: "u1", finishedOn: "2024-03-10", rating: 8 },
      { id: "u1-2026-01-05", userId: "u1", finishedOn: "2026-01-05", rating: 9 },
    ];
    expect(latestRatingPerUser(rows)).toEqual([
      { id: "u1-2026-01-05", userId: "u1", finishedOn: "2026-01-05", rating: 9 },
    ]);
  });

  it("no importa el orden de llegada de las filas", () => {
    const rows = [
      { id: "u1-2026-01-05", userId: "u1", finishedOn: "2026-01-05", rating: 9 },
      { id: "u1-2024-03-10", userId: "u1", finishedOn: "2024-03-10", rating: 8 },
    ];
    expect(latestRatingPerUser(rows)).toEqual([
      { id: "u1-2026-01-05", userId: "u1", finishedOn: "2026-01-05", rating: 9 },
    ]);
  });

  it("mantiene un voto por usuario distinto", () => {
    const rows = [
      { id: "u1-2025-01-01", userId: "u1", finishedOn: "2025-01-01", rating: 7 },
      { id: "u2-2025-02-01", userId: "u2", finishedOn: "2025-02-01", rating: 10 },
    ];
    const result = latestRatingPerUser(rows);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.rating).sort((a, b) => a - b)).toEqual([7, 10]);
  });

  it("una sola fila se devuelve tal cual", () => {
    const rows = [{ id: "u1-2025-06-01", userId: "u1", finishedOn: "2025-06-01", rating: 6 }];
    expect(latestRatingPerUser(rows)).toEqual(rows);
  });

  it("lista vacía devuelve lista vacía", () => {
    expect(latestRatingPerUser([])).toEqual([]);
  });

  it("desempata por id cuando dos pases comparten fecha, para que la media no dependa del orden de las filas", () => {
    // Un indice unico impide cerrar dos pases del mismo item el mismo dia, asi
    // que esto no deberia pasar; el desempate existe para que, si pasara, la
    // media no parpadee segun como Postgres devuelva las filas.
    const rows = [
      { id: "b", userId: "u1", finishedOn: "2026-01-05", rating: 6 },
      { id: "a", userId: "u1", finishedOn: "2026-01-05", rating: 9 },
    ];
    expect(latestRatingPerUser(rows)).toEqual([
      { id: "b", userId: "u1", finishedOn: "2026-01-05", rating: 6 },
    ]);
    expect(latestRatingPerUser([...rows].reverse())).toEqual([
      { id: "b", userId: "u1", finishedOn: "2026-01-05", rating: 6 },
    ]);
  });
});
