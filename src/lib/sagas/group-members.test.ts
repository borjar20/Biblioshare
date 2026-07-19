import { describe, expect, it } from "vitest";
import { averageSagaRating, computeProgress, groupMembers } from "./group-members";
import type { DetailMember, SagaChildRef } from "./types";

const member = (over: Partial<DetailMember>): DetailMember => ({
  itemType: "book",
  itemId: over.itemId ?? "x",
  title: over.title ?? "Título",
  coverUrl: null,
  href: "/libro/x",
  position: null,
  status: null,
  groupSagaId: null,
  ...over,
});

const children: SagaChildRef[] = [
  { id: "vapor", name: "La Edad del Vapor", accentColor: null },
  { id: "ceniza", name: "La Edad de Ceniza", accentColor: "verde" },
];

describe("groupMembers", () => {
  it("agrupa por hija directa y ordena grupos por su menor position", () => {
    const groups = groupMembers(
      [
        member({ itemId: "b4", groupSagaId: "vapor", position: 4 }),
        member({ itemId: "b1", groupSagaId: "ceniza", position: 1 }),
      ],
      children,
    );
    expect(groups.map((g) => g.sagaId)).toEqual(["ceniza", "vapor"]);
  });

  it("mete los miembros directos en un grupo nexo (sagaId null, beige) al final", () => {
    const groups = groupMembers(
      [
        member({ itemId: "hub", groupSagaId: null, position: null }),
        member({ itemId: "b1", groupSagaId: "ceniza", position: 1 }),
      ],
      children,
    );
    expect(groups.at(-1)).toMatchObject({ sagaId: null, accent: "beige" });
  });

  it("sin hijas: un único grupo sin nombre con todos los miembros", () => {
    const groups = groupMembers([member({ itemId: "a", position: 2 }), member({ itemId: "b", position: 1 })], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].sagaId).toBeNull();
    expect(groups[0].members.map((m) => m.itemId)).toEqual(["b", "a"]);
  });

  it("respeta accent_color persistido y rota para el resto sin repetir orden", () => {
    const groups = groupMembers(
      [
        member({ itemId: "b1", groupSagaId: "ceniza", position: 1 }),
        member({ itemId: "b4", groupSagaId: "vapor", position: 4 }),
      ],
      children,
    );
    expect(groups.find((g) => g.sagaId === "ceniza")?.accent).toBe("verde");
    expect(groups.find((g) => g.sagaId === "vapor")?.accent).toBe("terracota");
  });

  it("ordena miembros por position (nulls al final) y luego título", () => {
    const groups = groupMembers(
      [
        member({ itemId: "z", groupSagaId: "ceniza", position: null, title: "Zeta" }),
        member({ itemId: "a", groupSagaId: "ceniza", position: null, title: "Alfa" }),
        member({ itemId: "b2", groupSagaId: "ceniza", position: 2 }),
      ],
      children,
    );
    expect(groups[0].members.map((m) => m.itemId)).toEqual(["b2", "a", "z"]);
  });

  it("con más de 5 subsagas sin color reutiliza la secuencia sin colgarse", () => {
    const manyChildren = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"].map((id) => ({
      id,
      name: id,
      accentColor: null,
    }));
    const groups = groupMembers(
      manyChildren.map((c, i) =>
        member({ itemId: `i${i}`, groupSagaId: c.id, position: i + 1 }),
      ),
      manyChildren,
    );
    expect(groups).toHaveLength(7);
    expect(groups[5].accent).toBe("terracota");
    expect(groups[6].accent).toBe("verde");
  });
});

describe("computeProgress", () => {
  it("cuenta completados sobre el total y da segmentos por grupo", () => {
    const groups = groupMembers(
      [
        member({ itemId: "b1", groupSagaId: "ceniza", position: 1, status: "completed" }),
        member({ itemId: "b2", groupSagaId: "ceniza", position: 2, status: "in_progress" }),
        member({ itemId: "b4", groupSagaId: "vapor", position: 4 }),
        member({ itemId: "b5", groupSagaId: "vapor", position: 5, status: "completed" }),
      ],
      children,
    );
    const p = computeProgress(groups);
    expect(p).toMatchObject({ completed: 2, total: 4, pct: 50 });
    expect(p.segments).toEqual([
      { accent: "verde", fraction: 0.25 },
      { accent: "terracota", fraction: 0.25 },
    ]);
  });

  it("sin miembros: 0% sin dividir por cero", () => {
    expect(computeProgress([])).toMatchObject({ completed: 0, total: 0, pct: 0, segments: [] });
  });
});

describe("averageSagaRating", () => {
  it("media (1 decimal) de las medias por título, con el último pase por usuario", () => {
    expect(
      averageSagaRating([
        { itemKey: "book:a", userId: "u1", rating: 6, finishedOn: "2026-01-01", passId: "p1" },
        { itemKey: "book:a", userId: "u1", rating: 8, finishedOn: "2026-02-01", passId: "p2" },
        { itemKey: "book:b", userId: "u2", rating: 9, finishedOn: "2026-01-15", passId: "p3" },
      ]),
      // item a → 8 (último pase de u1); item b → 9; media 8,5
    ).toBe(8.5);
  });

  it("null si no hay notas", () => {
    expect(averageSagaRating([])).toBeNull();
  });
});
