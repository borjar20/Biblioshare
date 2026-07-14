import { describe, expect, it } from "vitest";
import { latestRatingPerUser } from "./latest-rating";

describe("latestRatingPerUser", () => {
  it("una relectura sustituye el voto de la primera lectura (caso de control: 8 en 2024, 9 en 2026 -> vota 9)", () => {
    const rows = [
      { userId: "u1", finishedOn: "2024-03-10", rating: 8 },
      { userId: "u1", finishedOn: "2026-01-05", rating: 9 },
    ];
    expect(latestRatingPerUser(rows)).toEqual([
      { userId: "u1", finishedOn: "2026-01-05", rating: 9 },
    ]);
  });

  it("no importa el orden de llegada de las filas", () => {
    const rows = [
      { userId: "u1", finishedOn: "2026-01-05", rating: 9 },
      { userId: "u1", finishedOn: "2024-03-10", rating: 8 },
    ];
    expect(latestRatingPerUser(rows)).toEqual([
      { userId: "u1", finishedOn: "2026-01-05", rating: 9 },
    ]);
  });

  it("mantiene un voto por usuario distinto", () => {
    const rows = [
      { userId: "u1", finishedOn: "2025-01-01", rating: 7 },
      { userId: "u2", finishedOn: "2025-02-01", rating: 10 },
    ];
    const result = latestRatingPerUser(rows);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.rating).sort((a, b) => a - b)).toEqual([7, 10]);
  });

  it("una sola fila se devuelve tal cual", () => {
    const rows = [{ userId: "u1", finishedOn: "2025-06-01", rating: 6 }];
    expect(latestRatingPerUser(rows)).toEqual(rows);
  });

  it("lista vacía devuelve lista vacía", () => {
    expect(latestRatingPerUser([])).toEqual([]);
  });
});
