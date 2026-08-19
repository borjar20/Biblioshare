import { describe, it, expect } from "vitest";
import {
  buildCalendarMarks,
  monthGrid,
  marksByDate,
  agendaForMonth,
  parseMonthParam,
  proximasMarcas,
  groupMarksByDay,
  type CalendarActivityRow,
  type CalendarCheckpointRow,
} from "./calendar-marks";

const SLUG = "mi-club";
const HOY = "2026-07-22";

function actividad(over: Partial<CalendarActivityRow> = {}): CalendarActivityRow {
  return {
    id: "a1",
    kind: "buddy_read",
    title: "Fundación",
    status: "active",
    startsOn: null,
    endsOn: null,
    eventType: null,
    config: null,
    startsAt: null,
    eventTimezone: null,
    ...over,
  };
}

describe("buildCalendarMarks", () => {
  // Desde la spec 2026-08-04 un evento SÍ enlaza, a su ficha propia. Lo que sigue
  // siendo cierto —y es lo que esta prueba protege— es que NO enlaza a
  // /actividad/[id], que devuelve 404 para eventos.
  it("un evento produce UNA marca que enlaza a su ficha, no a /actividad", () => {
    const marks = buildCalendarMarks(
      [actividad({ kind: "evento", title: "Café literario", startsOn: "2026-07-04" })],
      [],
      HOY,
      SLUG,
    );
    expect(marks).toHaveLength(1);
    expect(marks[0].markKind).toBe("evento");
    expect(marks[0].href).toBe(`/club/${SLUG}/evento/a1`);
    expect(marks[0].href).not.toContain("/actividad/");
    expect(marks[0].title).toBe("Café literario");
  });

  // #135: un evento sin `starts_on` (hoy bloqueado en las RPC, pero alcanzable
  // por el camino genérico de proponer actividad) no debe producir ninguna
  // marca ni colarse en el orden por fecha -- el guard `if (activity.startsOn)`
  // ya lo hacía; esta prueba lo deja explícito en vez de depender del valor por
  // defecto de `actividad()`.
  it("un evento SIN starts_on no produce ninguna marca", () => {
    const marks = buildCalendarMarks(
      [actividad({ kind: "evento", startsOn: null })],
      [],
      HOY,
      SLUG,
    );
    expect(marks).toHaveLength(0);
  });

  it("un evento se marca como seguido solo si quien mira lo sigue", () => {
    const [sinSeguir] = buildCalendarMarks(
      [actividad({ kind: "evento", startsOn: "2026-07-04" })],
      [],
      HOY,
      SLUG,
    );
    expect(sinSeguir.followedByViewer).toBe(false);

    const [seguido] = buildCalendarMarks(
      [actividad({ kind: "evento", startsOn: "2026-07-04" })],
      [],
      HOY,
      SLUG,
      new Map([["a1", 1440]]),
    );
    expect(seguido.followedByViewer).toBe(true);
  });

  // La CLAVE dice que lo sigue; el VALOR, cuándo se le avisa. Son dos preguntas
  // distintas, y confundirlas es el bug fácil: un evento seguido SIN aviso tiene
  // `remindMinutesBefore` a null y sigue estando seguido.
  it("seguido sin recordatorio sigue contando como seguido", () => {
    const [marca] = buildCalendarMarks(
      [actividad({ kind: "evento", startsOn: "2026-07-04" })],
      [],
      HOY,
      SLUG,
      new Map([["a1", null]]),
    );
    expect(marca.followedByViewer).toBe(true);
    expect(marca.remindMinutesBefore).toBeNull();
  });

  it("el offset guardado llega a la marca", () => {
    const [marca] = buildCalendarMarks(
      [actividad({ kind: "evento", startsOn: "2026-07-04" })],
      [],
      HOY,
      SLUG,
      new Map([["a1", 10080]]),
    );
    expect(marca.remindMinutesBefore).toBe(10080);
  });

  // La hoja de aviso necesita el INSTANTE y la ZONA para decir a qué hora
  // avisaría. `startsOn` (fecha suelta) no sirve para eso.
  it("un evento lleva su instante y su zona; un hito no", () => {
    const checkpoint: CalendarCheckpointRow = {
      id: "c1",
      label: "Hito 1",
      dueOn: "2026-07-10",
      activityId: "a1",
      activityTitle: "Fundación",
      activityKind: "buddy_read",
      activityStatus: "active",
    };
    const marks = buildCalendarMarks(
      [
        actividad({
          kind: "evento",
          startsOn: "2026-07-04",
          startsAt: "2026-07-04T17:00:00.000Z",
          eventTimezone: "Europe/Madrid",
        }),
      ],
      [checkpoint],
      HOY,
      SLUG,
    );
    const evento = marks.find((m) => m.markKind === "evento");
    expect(evento?.startsAt).toBe("2026-07-04T17:00:00.000Z");
    expect(evento?.eventTimezone).toBe("Europe/Madrid");

    const hito = marks.find((m) => m.markKind === "hito");
    expect(hito?.startsAt).toBeNull();
    expect(hito?.eventTimezone).toBeNull();
  });

  // Un hito no se sigue: aunque su actividad esté en el conjunto, la marca de
  // checkpoint no puede salir marcada como seguida.
  it("un hito nunca se marca como seguido", () => {
    const checkpoint: CalendarCheckpointRow = {
      id: "c1",
      label: "Hito 1",
      dueOn: "2026-07-10",
      activityId: "a1",
      activityTitle: "Fundación",
      activityKind: "buddy_read",
      activityStatus: "active",
    };
    const marks = buildCalendarMarks(
      [actividad({ kind: "buddy_read", startsOn: "2026-07-01" })],
      [checkpoint],
      HOY,
      SLUG,
      new Map([["a1", 1440]]),
    );
    const hitoMark = marks.find((m) => m.markKind === "hito");
    expect(hitoMark?.followedByViewer).toBe(false);
  });

  it("un evento IGNORA su ends_on aunque tenga valor", () => {
    const marks = buildCalendarMarks(
      [actividad({ kind: "evento", startsOn: "2026-07-04", endsOn: "2026-07-09" })],
      [],
      HOY,
      SLUG,
    );
    expect(marks).toHaveLength(1);
    expect(marks.map((m) => m.markKind)).toEqual(["evento"]);
  });

  it("una actividad normal con ambas fechas produce inicio y cierre, ambas enlazadas", () => {
    const marks = buildCalendarMarks(
      [actividad({ id: "a9", startsOn: "2026-07-20", endsOn: "2026-07-31" })],
      [],
      HOY,
      SLUG,
    );
    expect(marks.map((m) => m.markKind)).toEqual(["inicio", "cierre"]);
    expect(marks.every((m) => m.href === `/club/${SLUG}/actividad/a9`)).toBe(true);
  });

  it("proposed y archived no entran; finished sí", () => {
    const rows = [
      actividad({ id: "p", status: "proposed", startsOn: "2026-07-05" }),
      actividad({ id: "x", status: "archived", startsOn: "2026-07-06" }),
      actividad({ id: "f", status: "finished", startsOn: "2026-07-07" }),
    ];
    const marks = buildCalendarMarks(rows, [], HOY, SLUG);
    expect(marks.map((m) => m.activityId)).toEqual(["f"]);
  });

  it("past es estricto: hoy NO es pasado", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "hoy", kind: "evento", startsOn: HOY }),
        actividad({ id: "ayer", kind: "evento", startsOn: "2026-07-21" }),
      ],
      [],
      HOY,
      SLUG,
    );
    const byId = Object.fromEntries(marks.map((m) => [m.activityId, m.past]));
    expect(byId.hoy).toBe(false);
    expect(byId.ayer).toBe(true);
  });

  it("un hito toma el label como título y el título de la actividad como detalle", () => {
    const checkpoint: CalendarCheckpointRow = {
      id: "c1",
      label: "Hito 4",
      dueOn: "2026-07-18",
      activityId: "a1",
      activityTitle: "Fundación",
      activityKind: "buddy_read",
      activityStatus: "active",
    };
    const marks = buildCalendarMarks([], [checkpoint], HOY, SLUG);
    expect(marks).toHaveLength(1);
    expect(marks[0].markKind).toBe("hito");
    expect(marks[0].title).toBe("Hito 4");
    expect(marks[0].detail).toBe("Fundación");
    expect(marks[0].href).toBe(`/club/${SLUG}/actividad/a1`);
  });

  it("un hito de una actividad proposed no entra", () => {
    const checkpoint: CalendarCheckpointRow = {
      id: "c1",
      label: "Hito 1",
      dueOn: "2026-07-18",
      activityId: "a1",
      activityTitle: "Fundación",
      activityKind: "buddy_read",
      activityStatus: "proposed",
    };
    expect(buildCalendarMarks([], [checkpoint], HOY, SLUG)).toHaveLength(0);
  });

  it("un hito de una actividad evento no enlaza (aunque hoy sea inalcanzable)", () => {
    const checkpoint: CalendarCheckpointRow = {
      id: "c1",
      label: "Hito 1",
      dueOn: "2026-07-18",
      activityId: "e1",
      activityTitle: "Café literario",
      activityKind: "evento",
      activityStatus: "active",
    };
    const marks = buildCalendarMarks([], [checkpoint], HOY, SLUG);
    expect(marks).toHaveLength(1);
    expect(marks[0].markKind).toBe("hito");
    expect(marks[0].href).toBeNull();
  });

  it("ordena por fecha ascendente", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "b", kind: "evento", startsOn: "2026-07-26" }),
        actividad({ id: "a", kind: "evento", startsOn: "2026-07-04" }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(marks.map((m) => m.date)).toEqual(["2026-07-04", "2026-07-26"]);
  });

  it("con varias marcas el mismo día, el orden es inicio, hito, evento, cierre", () => {
    // Títulos elegidos a propósito para que el orden alfabético (el
    // desempate que queda si se borra ORDEN_MARCA) NO coincida con el orden
    // esperado: así el test detecta que ese término desaparezca.
    const D = "2026-07-15";
    const checkpoint: CalendarCheckpointRow = {
      id: "c1",
      label: "Alpha hito",
      dueOn: D,
      activityId: "a-hito",
      activityTitle: "Fundación",
      activityKind: "buddy_read",
      activityStatus: "active",
    };
    const marks = buildCalendarMarks(
      [
        actividad({ id: "a-cierre", title: "Whiskey actividad", endsOn: D }),
        actividad({ id: "a-evento", kind: "evento", title: "Mike evento", startsOn: D }),
        actividad({ id: "a-inicio", title: "Bravo actividad", startsOn: D }),
      ],
      [checkpoint],
      HOY,
      SLUG,
    );
    expect(marks.map((m) => m.markKind)).toEqual(["inicio", "hito", "evento", "cierre"]);
  });

  it("un lanzamiento con ítem propaga tipo y medio", () => {
    const marks = buildCalendarMarks(
      [
        actividad({
          kind: "evento",
          title: "Dune 3",
          startsOn: "2026-07-04",
          eventType: "lanzamiento",
          config: { item: { itemType: "movie", itemId: "m1" }, allDay: true },
        }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(marks[0].eventType).toBe("lanzamiento");
    expect(marks[0].medium).toBe("movie");
  });

  it("un lanzamiento SIN ítem deja el medio a null — config.item es nullable", () => {
    const marks = buildCalendarMarks(
      [
        actividad({
          kind: "evento",
          startsOn: "2026-07-04",
          eventType: "lanzamiento",
          config: { allDay: true },
        }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(marks[0].eventType).toBe("lanzamiento");
    expect(marks[0].medium).toBeNull();
  });

  it("un encuentro no tiene medio", () => {
    const marks = buildCalendarMarks(
      [actividad({ kind: "evento", startsOn: "2026-07-04", eventType: "encuentro", config: {} })],
      [],
      HOY,
      SLUG,
    );
    expect(marks[0].eventType).toBe("encuentro");
    expect(marks[0].medium).toBeNull();
  });

  it("una actividad NO-evento deja los dos campos a null", () => {
    const marks = buildCalendarMarks(
      [actividad({ startsOn: "2026-07-20", endsOn: "2026-07-31" })],
      [],
      HOY,
      SLUG,
    );
    expect(marks.map((m) => m.eventType)).toEqual([null, null]);
    expect(marks.map((m) => m.medium)).toEqual([null, null]);
  });

  it("un HITO de una actividad evento tampoco lleva tipo ni medio", () => {
    // La marca es del checkpoint, no del evento: heredar su tipo la pintaría
    // del color del lanzamiento en vez del de hito.
    const marks = buildCalendarMarks(
      [],
      [
        {
          id: "h1",
          label: "Capítulo 5",
          dueOn: "2026-07-30",
          activityId: "a1",
          activityTitle: "Un evento raro",
          activityKind: "evento",
          activityStatus: "active",
        } satisfies CalendarCheckpointRow,
      ],
      HOY,
      SLUG,
    );
    expect(marks[0].markKind).toBe("hito");
    expect(marks[0].eventType).toBeNull();
    expect(marks[0].medium).toBeNull();
  });
});

describe("monthGrid", () => {
  it("rellena semanas completas empezando en lunes", () => {
    // 1 jul 2026 es MIÉRCOLES -> dos celdas de relleno delante (lun 29, mar 30).
    const cells = monthGrid("2026-07");
    expect(cells.length % 7).toBe(0);
    expect(cells[0]).toEqual({ date: "2026-06-29", day: 29, outside: true });
    expect(cells[1]).toEqual({ date: "2026-06-30", day: 30, outside: true });
    expect(cells[2]).toEqual({ date: "2026-07-01", day: 1, outside: false });
  });

  it("un mes que empieza en DOMINGO lleva seis celdas de relleno delante", () => {
    // 1 nov 2026 es domingo: el peor caso con semana que empieza en lunes.
    const cells = monthGrid("2026-11");
    expect(cells.slice(0, 6).every((c) => c.outside)).toBe(true);
    expect(cells[6]).toEqual({ date: "2026-11-01", day: 1, outside: false });
  });

  it("febrero bisiesto tiene 29 días propios", () => {
    const propios = monthGrid("2028-02").filter((c) => !c.outside);
    expect(propios).toHaveLength(29);
    expect(propios[28].date).toBe("2028-02-29");
  });

  it("febrero no bisiesto tiene 28", () => {
    expect(monthGrid("2026-02").filter((c) => !c.outside)).toHaveLength(28);
  });

  it("enero cruza el año hacia atrás: 2027-01 empieza en 2026-12-28", () => {
    const cells = monthGrid("2027-01");
    expect(cells[0]).toEqual({ date: "2026-12-28", day: 28, outside: true });
  });

  it("diciembre cruza el año hacia adelante: 2026-12 acaba en 2027-01-03", () => {
    const cells = monthGrid("2026-12");
    expect(cells[cells.length - 1]).toEqual({ date: "2027-01-03", day: 3, outside: true });
  });
});

describe("agendaForMonth", () => {
  const marks = buildCalendarMarks(
    [
      actividad({ id: "e1", kind: "evento", startsOn: "2026-07-04" }),
      actividad({ id: "e2", kind: "evento", startsOn: "2026-07-26" }),
      actividad({ id: "e3", kind: "evento", startsOn: "2026-08-03" }),
    ],
    [],
    HOY,
    SLUG,
  );

  it("en el mes actual empieza en hoy", () => {
    expect(agendaForMonth(marks, "2026-07", HOY).map((m) => m.date)).toEqual([
      "2026-07-26",
    ]);
  });

  it("en otro mes lista todo el mes", () => {
    expect(agendaForMonth(marks, "2026-08", HOY).map((m) => m.date)).toEqual([
      "2026-08-03",
    ]);
  });

  it("en un mes pasado lista todo, incluido lo anterior a hoy", () => {
    expect(agendaForMonth(marks, "2026-07", "2026-09-01").map((m) => m.date)).toEqual([
      "2026-07-04",
      "2026-07-26",
    ]);
  });
});

describe("proximasMarcas", () => {
  it("descarta inicio y cierre, se queda con hito y evento", () => {
    const checkpoint: CalendarCheckpointRow = {
      id: "c1",
      label: "Hito 1",
      dueOn: "2026-07-25",
      activityId: "a1",
      activityTitle: "Fundación",
      activityKind: "buddy_read",
      activityStatus: "active",
    };
    const marks = buildCalendarMarks(
      [
        actividad({ id: "a-normal", startsOn: "2026-07-23", endsOn: "2026-07-30" }),
        actividad({ id: "a-evento", kind: "evento", startsOn: "2026-07-24" }),
      ],
      [checkpoint],
      HOY,
      SLUG,
    );
    const proximas = proximasMarcas(marks, HOY, 10);
    expect(proximas.map((m) => m.markKind)).toEqual(["evento", "hito"]);
  });

  it("una marca de HOY sí entra (el borde estricto)", () => {
    const marks = buildCalendarMarks(
      [actividad({ id: "a-hoy", kind: "evento", startsOn: HOY })],
      [],
      HOY,
      SLUG,
    );
    expect(proximasMarcas(marks, HOY, 10).map((m) => m.activityId)).toEqual([
      "a-hoy",
    ]);
  });

  it("descarta lo pasado", () => {
    const marks = buildCalendarMarks(
      [actividad({ id: "a-ayer", kind: "evento", startsOn: "2026-07-21" })],
      [],
      HOY,
      SLUG,
    );
    expect(proximasMarcas(marks, HOY, 10)).toHaveLength(0);
  });

  it("respeta el límite", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "e1", kind: "evento", startsOn: "2026-07-23" }),
        actividad({ id: "e2", kind: "evento", startsOn: "2026-07-24" }),
        actividad({ id: "e3", kind: "evento", startsOn: "2026-07-25" }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(proximasMarcas(marks, HOY, 2).map((m) => m.activityId)).toEqual([
      "e1",
      "e2",
    ]);
  });

  it("conserva el orden ascendente que ya trae buildCalendarMarks", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "tarde", kind: "evento", startsOn: "2026-07-28" }),
        actividad({ id: "temprano", kind: "evento", startsOn: "2026-07-23" }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(proximasMarcas(marks, HOY, 10).map((m) => m.activityId)).toEqual([
      "temprano",
      "tarde",
    ]);
  });

  // La pestaña Actividades (a diferencia del feed) no tiene nada encima que ya
  // enseñe los inicios/cierre, así que pide el cuarto parámetro con los cuatro
  // tipos -- si no, su rail de fechas no puede enseñar NUNCA una actividad que
  // solo tiene inicio/cierre y ningún hito ni evento.
  it("con el cuarto parámetro también entran inicio y cierre", () => {
    const marks = buildCalendarMarks(
      [actividad({ id: "a-normal", startsOn: "2026-07-23", endsOn: "2026-07-30" })],
      [],
      HOY,
      SLUG,
    );
    const todos = proximasMarcas(marks, HOY, 10, ["hito", "evento", "inicio", "cierre"]);
    expect(todos.map((m) => m.markKind)).toEqual(["inicio", "cierre"]);
  });

  it("el cuarto parámetro puede acotar a un solo kind", () => {
    const marks = buildCalendarMarks(
      [actividad({ id: "a-normal", startsOn: "2026-07-23", endsOn: "2026-07-30" })],
      [],
      HOY,
      SLUG,
    );
    expect(proximasMarcas(marks, HOY, 10, ["cierre"]).map((m) => m.markKind)).toEqual([
      "cierre",
    ]);
  });
});

describe("marksByDate", () => {
  it("agrupa varias marcas del mismo día", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "a", kind: "evento", startsOn: "2026-07-04" }),
        actividad({ id: "b", kind: "evento", startsOn: "2026-07-04" }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(marksByDate(marks).get("2026-07-04")).toHaveLength(2);
  });
});

describe("parseMonthParam", () => {
  it("acepta un mes válido", () => {
    expect(parseMonthParam("2026-10", HOY)).toBe("2026-10");
  });
  it("cae al mes de hoy si falta o es basura", () => {
    expect(parseMonthParam(null, HOY)).toBe("2026-07");
    expect(parseMonthParam("no-es-un-mes", HOY)).toBe("2026-07");
    expect(parseMonthParam("2026-13", HOY)).toBe("2026-07");
    expect(parseMonthParam("2026-00", HOY)).toBe("2026-07");
  });
  it("rechaza un año con cero inicial (mezclaría siglos en monthGrid)", () => {
    expect(parseMonthParam("0050-03", HOY)).toBe("2026-07");
  });
});

describe("groupMarksByDay", () => {
  it("una lista vacía no produce grupos", () => {
    expect(groupMarksByDay([])).toEqual([]);
  });

  it("dos marcas del mismo día caen en UN grupo", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "a", kind: "evento", title: "Uno", startsOn: "2026-07-04" }),
        actividad({ id: "b", kind: "evento", title: "Dos", startsOn: "2026-07-04" }),
      ],
      [],
      HOY,
      SLUG,
    );
    const grupos = groupMarksByDay(marks);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].date).toBe("2026-07-04");
    // "Dos" antes que "Uno" NO es una errata: en igualdad de fecha y clase de
    // marca, buildCalendarMarks desempata por TÍTULO, y "Dos" < "Uno". Esa es
    // justamente la prueba de que groupMarksByDay conserva el orden que RECIBE
    // en vez de reordenar por su cuenta. Si alguien lo "corrige" al orden en que
    // se construyó el array de entrada, este test deja de probar nada.
    expect(grupos[0].marks.map((m) => m.title)).toEqual(["Dos", "Uno"]);
  });

  it("días distintos producen grupos distintos, en el orden de entrada", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "a", kind: "evento", title: "Cuatro", startsOn: "2026-07-04" }),
        actividad({ id: "b", kind: "evento", title: "Nueve", startsOn: "2026-07-09" }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(groupMarksByDay(marks).map((g) => g.date)).toEqual(["2026-07-04", "2026-07-09"]);
  });

  it("NO reordena: agrupa consecutivos y respeta el orden que recibe", () => {
    // Depende de que buildCalendarMarks entregue ordenado (ya testeado). Si esta
    // función reordenara, habría dos responsables del orden y podrían divergir.
    // Con una entrada desordenada a propósito, el mismo día partido en dos
    // grupos es el comportamiento CORRECTO, no un bug.
    const marks = buildCalendarMarks(
      [actividad({ id: "a", kind: "evento", startsOn: "2026-07-04" })],
      [],
      HOY,
      SLUG,
    );
    const desordenada = [marks[0], { ...marks[0], date: "2026-07-09" }, marks[0]];
    expect(groupMarksByDay(desordenada).map((g) => g.date)).toEqual([
      "2026-07-04",
      "2026-07-09",
      "2026-07-04",
    ]);
  });

  it("no inventa días sin marcas entre dos fechas lejanas", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "a", kind: "evento", startsOn: "2026-07-01" }),
        actividad({ id: "b", kind: "evento", startsOn: "2026-07-28" }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(groupMarksByDay(marks)).toHaveLength(2);
  });
});
