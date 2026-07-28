import { describe, expect, it } from "vitest";
import {
  averageSagaRating,
  computeProgress,
  groupMembers,
  orderBlocksForLayout,
  partitionGroups,
} from "./group-members";
import type { MemberGroup } from "./group-members";
import type { DetailMember, ResolvedWindow, SagaChildRef, SagaPlacement } from "./types";

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
  skipped: false,
  ...over,
});

const children: SagaChildRef[] = [
  { id: "vapor", name: "La Edad del Vapor", accentColor: null, positionInParent: null, placementInParent: null, optionalInParent: false },
  { id: "ceniza", name: "La Edad de Ceniza", accentColor: "verde", positionInParent: null, placementInParent: null, optionalInParent: false },
];

describe("groupMembers", () => {
  it("la colocación curada manda sobre el menor `position` de los miembros", () => {
    // El caso real del Cosmere: Elantris está curado en el hueco 2 y su única
    // obra no tiene número; Archivo está en el 5 y su primera obra es la 1. Con
    // el criterio viejo salía Archivo primero, contradiciendo al curador.
    const curados: SagaChildRef[] = [
      { id: "elantris", name: "Elantris", accentColor: null, positionInParent: 2, placementInParent: "fijo", optionalInParent: false },
      { id: "archivo", name: "El Archivo de las Tormentas", accentColor: null, positionInParent: 5, placementInParent: "fijo", optionalInParent: false },
    ];
    const groups = groupMembers(
      [
        member({ itemId: "elantris-1", groupSagaId: "elantris", position: null }),
        member({ itemId: "camino", groupSagaId: "archivo", position: 1, placement: "fijo" }),
      ],
      curados,
    );
    expect(groups.map((g) => g.sagaId)).toEqual(["elantris", "archivo"]);
  });

  it("un bloque sin colocar va DETRÁS de los colocados", () => {
    const mezcla: SagaChildRef[] = [
      { id: "sin", name: "Sin colocar", accentColor: null, positionInParent: null, placementInParent: null, optionalInParent: false },
      { id: "con", name: "Con hueco", accentColor: null, positionInParent: 9, placementInParent: "fijo", optionalInParent: false },
    ];
    const groups = groupMembers(
      [
        member({ itemId: "a", groupSagaId: "sin", position: 1, placement: "fijo" }),
        member({ itemId: "b", groupSagaId: "con", position: 2, placement: "fijo" }),
      ],
      mezcla,
    );
    expect(groups.map((g) => g.sagaId)).toEqual(["con", "sin"]);
  });

  it("entre bloques sin colocar se conserva el criterio de siempre", () => {
    // Las 6 subsagas sin colocar que hay hoy en prod no pueden moverse de sitio
    // por este cambio. `children` (el const de la cabecera) son justo eso: dos
    // hijas sin colocar.
    const groups = groupMembers(
      [
        member({ itemId: "b4", groupSagaId: "vapor", position: 4, placement: "fijo" }),
        member({ itemId: "b1", groupSagaId: "ceniza", position: 1, placement: "fijo" }),
      ],
      children,
    );
    expect(groups.map((g) => g.sagaId)).toEqual(["ceniza", "vapor"]);
  });

  it("cada grupo lleva SU propia colocación, no la del primero", () => {
    // Con una sola hija esta prueba no valdría: no distinguiría «la del bloque
    // correcto» de «siempre la del primero». Demostrado con inyección de fallo.
    const mixtas: SagaChildRef[] = [
      { id: "colocada", name: "Colocada", accentColor: null, positionInParent: 3, placementInParent: "fijo", optionalInParent: false },
      { id: "secretas", name: "Novelas secretas", accentColor: null, positionInParent: null, placementInParent: "libre", optionalInParent: false },
    ];
    const groups = groupMembers(
      [
        member({ itemId: "a", groupSagaId: "colocada", position: 1, placement: "fijo" }),
        member({ itemId: "b", groupSagaId: "secretas" }),
      ],
      mixtas,
    );
    const byId = new Map(groups.map((g) => [g.sagaId, g]));
    expect(byId.get("colocada")).toMatchObject({ positionInParent: 3, placementInParent: "fijo" });
    expect(byId.get("secretas")).toMatchObject({ positionInParent: null, placementInParent: "libre" });
  });

  it("dos bloques en el mismo hueco (tándem) desempatan por nombre, de forma estable", () => {
    const tandem: SagaChildRef[] = [
      { id: "zeta", name: "Zeta", accentColor: null, positionInParent: 4, placementInParent: "fijo", optionalInParent: false },
      { id: "alfa", name: "Alfa", accentColor: null, positionInParent: 4, placementInParent: "fijo", optionalInParent: false },
    ];
    const members = [
      member({ itemId: "z", groupSagaId: "zeta", position: 1, placement: "fijo" }),
      member({ itemId: "a", groupSagaId: "alfa", position: 2, placement: "fijo" }),
    ];
    expect(groupMembers(members, tandem).map((g) => g.sagaId)).toEqual(["alfa", "zeta"]);
    // Y el mismo resultado con las hijas en el orden contrario: el orden de
    // salida no puede depender del orden de entrada.
    expect(groupMembers(members, [...tandem].reverse()).map((g) => g.sagaId)).toEqual(["alfa", "zeta"]);
  });

  it("el grupo de miembros directos no es un bloque: no tiene colocación", () => {
    const groups = groupMembers([member({ itemId: "a", position: 1, placement: "fijo" })], []);
    expect(groups[0].sagaId).toBeNull();
    expect(groups[0].placementInParent).toBeNull();
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
      placementInParent: null,
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

describe("partitionGroups", () => {
  const group = (over: Partial<MemberGroup>): MemberGroup => ({
    sagaId: over.sagaId ?? "g",
    name: "Bloque",
    accent: "beige",
    members: [],
    positionInParent: null,
    placementInParent: null,
    ...over,
  });

  it("reparte un grupo `libre` a «Cuando quieras», uno colocado a la lista ordenada y uno sin clasificar a la ordenada", () => {
    const libre = group({ sagaId: "libre", placementInParent: "libre" });
    const colocado = group({ sagaId: "colocado", placementInParent: "fijo", positionInParent: 1 });
    const sinClasificar = group({ sagaId: "sin", placementInParent: null });
    const { ordered, free } = partitionGroups([libre, colocado, sinClasificar]);
    expect(ordered).toEqual([colocado, sinClasificar]);
    expect(free).toEqual([libre]);
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

  it("cuenta completados sobre `counted` y da segmentos por grupo", () => {
    const p = computeProgress(fourMembers(), all);
    expect(p).toMatchObject({ completed: 2, total: 4, pct: 50 });
    expect(p.segments).toEqual([
      { accent: "verde", fraction: 0.25 },
      { accent: "terracota", fraction: 0.25 },
    ]);
  });

  // El caso del issue #91: el hero contaba TODOS los miembros del subárbol y
  // decía 2/7 = 29% donde la card de biblioteca, que ya aplicaba §1.5, decía
  // 2/5 = 40%. Las claves que no llegan en `counted` (hoy: countedKeys, spec
  // 2026-07-25 — miembros `optional` o colgando de un bloque
  // `optionalInParent`) no penalizan. Eso es distinto de "fuera del orden
  // principal" (sin hueco en la SECUENCIA de mainOrder): son ejes ortogonales.
  it("los miembros fuera de `counted` no entran en el denominador", () => {
    const p = computeProgress(fourMembers(), ["book:b1", "book:b5"]);
    expect(p).toMatchObject({ completed: 2, total: 2, pct: 100 });
  });

  it("una clave de `counted` sin miembro suma al total pero no a un segmento", () => {
    const p = computeProgress(fourMembers(), [...all, "book:huerfano"]);
    expect(p).toMatchObject({ completed: 2, total: 5, pct: 40 });
    expect(p.segments.reduce((n, s) => n + s.fraction, 0)).toBeCloseTo(0.4);
  });

  it("`counted` vacío: 0% sin dividir por cero", () => {
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

describe("orderBlocksForLayout", () => {
  // Helpers locales: un bloque con un `sagaId` legible (`saga-<nombre>`) para
  // poder escribir su clave de ventana (`s:saga-<nombre>`) sin inventar uuids.
  const bloque = (name: string, placement: SagaPlacement | null, works: string[]): MemberGroup => {
    const sagaId = `saga-${name}`;
    return {
      sagaId,
      name,
      accent: "beige",
      members: works.map((id) => member({ itemId: id, title: id, groupSagaId: sagaId, position: 1 })),
      positionInParent: placement === "libre" ? null : 1,
      placementInParent: placement,
    };
  };

  const ventana = (after: string | null, before: string | null): ResolvedWindow => ({
    afterKey: after,
    afterTitle: after,
    beforeKey: before,
    beforeTitle: before,
    reason: null,
  });

  const nombres = (list: MemberGroup[]) => list.map((g) => g.name);

  it("un libre anclado DESPUÉS de una obra se coloca detrás del bloque de esa obra", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const dos = bloque("Dos", "fijo", ["b"]);
    const libre = bloque("Libre", "libre", ["l"]);
    const orden = orderBlocksForLayout([uno, dos], [libre], {
      "s:saga-Libre": ventana("i:book:a", null),
    });
    expect(nombres(orden)).toEqual(["Uno", "Libre", "Dos"]);
  });

  it("un libre anclado ANTES de un bloque se coloca delante de ese bloque", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const dos = bloque("Dos", "fijo", ["b"]);
    const libre = bloque("Libre", "libre", ["l"]);
    const orden = orderBlocksForLayout([uno, dos], [libre], {
      "s:saga-Libre": ventana(null, "s:saga-Dos"),
    });
    expect(nombres(orden)).toEqual(["Uno", "Libre", "Dos"]);
  });

  it("`after` manda sobre `before` cuando la ventana trae los dos", () => {
    // Misma preferencia que la ficha: «a partir de» sitúa, «antes de» solo acota.
    const uno = bloque("Uno", "fijo", ["a"]);
    const dos = bloque("Dos", "fijo", ["b"]);
    const libre = bloque("Libre", "libre", ["l"]);
    const orden = orderBlocksForLayout([uno, dos], [libre], {
      "s:saga-Libre": ventana("s:saga-Dos", "s:saga-Uno"),
    });
    expect(nombres(orden)).toEqual(["Uno", "Dos", "Libre"]);
  });

  it("un libre anclado a OTRO libre espera a que el primero esté colocado", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const primero = bloque("Primero", "libre", ["p"]);
    const segundo = bloque("Segundo", "libre", ["s"]);
    // `segundo` se procesa ANTES que `primero` a propósito: su ancla todavía no
    // está en la lista, así que solo puede colocarse en una pasada posterior.
    const orden = orderBlocksForLayout([uno], [segundo, primero], {
      "s:saga-Primero": ventana("i:book:a", null),
      "s:saga-Segundo": ventana("s:saga-Primero", null),
    });
    expect(nombres(orden)).toEqual(["Uno", "Primero", "Segundo"]);
  });

  it("dos libres con la MISMA ancla y el mismo lado conservan su orden relativo", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const p = bloque("P", "libre", ["p"]);
    const q = bloque("Q", "libre", ["q"]);
    const orden = orderBlocksForLayout([uno], [p, q], {
      "s:saga-P": ventana("i:book:a", null),
      "s:saga-Q": ventana("i:book:a", null),
    });
    expect(nombres(orden)).toEqual(["Uno", "P", "Q"]);
  });

  it("un libre sin ventana se queda al final, como hoy", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const libre = bloque("Libre", "libre", ["l"]);
    expect(nombres(orderBlocksForLayout([uno], [libre], {}))).toEqual(["Uno", "Libre"]);
  });

  it("un ancla rota no coloca el bloque ni rompe a los demás", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const roto = bloque("Roto", "libre", ["r"]);
    const bueno = bloque("Bueno", "libre", ["g"]);
    const orden = orderBlocksForLayout([uno], [roto, bueno], {
      "s:saga-Roto": ventana("i:book:no-existe", null),
      "s:saga-Bueno": ventana("i:book:a", null),
    });
    expect(nombres(orden)).toEqual(["Uno", "Bueno", "Roto"]);
  });

  it("un ciclo de libres anclados entre sí no cuelga: los dos al final", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const x = bloque("X", "libre", ["x"]);
    const y = bloque("Y", "libre", ["y"]);
    const orden = orderBlocksForLayout([uno], [x, y], {
      "s:saga-X": ventana("s:saga-Y", null),
      "s:saga-Y": ventana("s:saga-X", null),
    });
    expect(nombres(orden)).toEqual(["Uno", "X", "Y"]);
  });

  it("sin bloques libres devuelve la zona ordenada intacta", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const dos = bloque("Dos", "fijo", ["b"]);
    expect(nombres(orderBlocksForLayout([uno, dos], [], {}))).toEqual(["Uno", "Dos"]);
  });
});

describe("rol narrativo (#167)", () => {
  it("conserva el role al agrupar y NO lo confunde con position", () => {
    const members: DetailMember[] = [
      { itemType: "book", itemId: "a", title: "Libro 1", coverUrl: null, href: "/a",
        position: 1, role: null, placement: null, optional: false, status: null, groupSagaId: null, ownerSagaId: "owner", year: 1990, skipped: false },
      { itemType: "book", itemId: "b", title: "Nueva Primavera", coverUrl: null, href: "/b",
        position: null, role: "precuela", placement: null, optional: false, status: null, groupSagaId: null, ownerSagaId: "owner", year: 2004, skipped: false },
      { itemType: "book", itemId: "c", title: "Sin clasificar", coverUrl: null, href: "/c",
        position: null, role: null, placement: null, optional: false, status: null, groupSagaId: null, ownerSagaId: "owner", year: 2010, skipped: false },
    ];

    const [group] = groupMembers(members, []);

    // Los cuatro casos del spec: numerada-sin-rol, sin-número-con-rol,
    // sin-número-sin-rol. El orden sigue siendo por position (nulls al final),
    // el role no lo altera.
    expect(group.members.map((m) => m.itemId)).toEqual(["a", "b", "c"]);
    expect(group.members.map((m) => m.role)).toEqual([null, "precuela", null]);
  });
});
