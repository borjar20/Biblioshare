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
  role: null,
  placement: null,
  optional: false,
  status: null,
  groupSagaId: null,
  ownerSagaId: "owner",
  year: null,
  ...over,
});

const children: SagaChildRef[] = [
  { id: "vapor", name: "La Edad del Vapor", accentColor: null, positionInParent: null, optionalInParent: false },
  { id: "ceniza", name: "La Edad de Ceniza", accentColor: "verde", positionInParent: null, optionalInParent: false },
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
    const manyChildren: SagaChildRef[] = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"].map((id) => ({
      id,
      name: id,
      accentColor: null,
      positionInParent: null,
      optionalInParent: false,
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
  const fourMembers = () =>
    groupMembers(
      [
        member({ itemId: "b1", groupSagaId: "ceniza", position: 1, status: "completed" }),
        member({ itemId: "b2", groupSagaId: "ceniza", position: 2, status: "in_progress" }),
        member({ itemId: "b4", groupSagaId: "vapor", position: 4 }),
        member({ itemId: "b5", groupSagaId: "vapor", position: 5, status: "completed" }),
      ],
      children,
    );
  const all = ["book:b1", "book:b2", "book:b4", "book:b5"];

  it("cuenta completados sobre el orden principal y da segmentos por grupo", () => {
    const p = computeProgress(fourMembers(), all);
    expect(p).toMatchObject({ completed: 2, total: 4, pct: 50 });
    expect(p.segments).toEqual([
      { accent: "verde", fraction: 0.25 },
      { accent: "terracota", fraction: 0.25 },
    ]);
  });

  // El caso del issue #91: el hero contaba TODOS los miembros del subárbol y
  // decía 2/7 = 29% donde la card de biblioteca, que ya aplicaba §1.5, decía
  // 2/5 = 40%. Los opcionales (fuera del orden) no penalizan.
  it("los miembros fuera del orden principal no entran en el denominador", () => {
    const p = computeProgress(fourMembers(), ["book:b1", "book:b5"]);
    expect(p).toMatchObject({ completed: 2, total: 2, pct: 100 });
  });

  it("una clave del orden sin miembro suma al total pero no a un segmento", () => {
    const p = computeProgress(fourMembers(), [...all, "book:huerfano"]);
    expect(p).toMatchObject({ completed: 2, total: 5, pct: 40 });
    expect(p.segments.reduce((n, s) => n + s.fraction, 0)).toBeCloseTo(0.4);
  });

  it("orden vacío: 0% sin dividir por cero", () => {
    expect(computeProgress([], [])).toMatchObject({ completed: 0, total: 0, pct: 0, segments: [] });
    expect(computeProgress(fourMembers(), [])).toMatchObject({ total: 0, pct: 0, segments: [] });
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

describe("rol narrativo (#167)", () => {
  it("conserva el role al agrupar y NO lo confunde con position", () => {
    const members: DetailMember[] = [
      { itemType: "book", itemId: "a", title: "Libro 1", coverUrl: null, href: "/a",
        position: 1, role: null, placement: null, optional: false, status: null, groupSagaId: null, ownerSagaId: "owner", year: 1990 },
      { itemType: "book", itemId: "b", title: "Nueva Primavera", coverUrl: null, href: "/b",
        position: null, role: "precuela", placement: null, optional: false, status: null, groupSagaId: null, ownerSagaId: "owner", year: 2004 },
      { itemType: "book", itemId: "c", title: "Sin clasificar", coverUrl: null, href: "/c",
        position: null, role: null, placement: null, optional: false, status: null, groupSagaId: null, ownerSagaId: "owner", year: 2010 },
    ];

    const [group] = groupMembers(members, []);

    // Los cuatro casos del spec: numerada-sin-rol, sin-número-con-rol,
    // sin-número-sin-rol. El orden sigue siendo por position (nulls al final),
    // el role no lo altera.
    expect(group.members.map((m) => m.itemId)).toEqual(["a", "b", "c"]);
    expect(group.members.map((m) => m.role)).toEqual([null, "precuela", null]);
  });
});
