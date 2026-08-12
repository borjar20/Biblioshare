import { describe, expect, it } from "vitest";
import { groupActivities, isPastEvent } from "./group-activities";
import type { ClubActivity } from "./core";

const HOY = "2026-07-22";

function act(over: Partial<ClubActivity>): ClubActivity {
  return {
    id: "id", clubId: "c", kind: "buddy_read", title: "t", description: null,
    status: "active", config: null, eventType: null, createdBy: "u", startsOn: null, endsOn: null,
    createdAt: "2026-07-01", viewerIsParticipant: false, participantCount: 0,
    spawnedFromActivityId: null, spawnedFromItem: null,
    ...over,
  };
}

describe("isPastEvent", () => {
  it("ayer ya pasó", () => expect(isPastEvent("2026-07-21", HOY)).toBe(true));
  it("hoy NO ha pasado — el evento es hoy", () =>
    expect(isPastEvent("2026-07-22", HOY)).toBe(false));
  it("mañana no ha pasado", () => expect(isPastEvent("2026-07-23", HOY)).toBe(false));
  it("sin fecha no cuenta como pasado", () => expect(isPastEvent(null, HOY)).toBe(false));
});

describe("groupActivities — en curso vs próximas se parte por la fecha de inicio", () => {
  it("activa sin fecha de inicio está EN CURSO: nada dice que sea futura", () => {
    const groups = groupActivities([act({ id: "a", startsOn: null })], HOY);
    expect(groups.enCurso.map((a) => a.id)).toEqual(["a"]);
    expect(groups.proximas).toHaveLength(0);
  });

  it("activa que empieza HOY está EN CURSO, no en próximas", () => {
    const groups = groupActivities([act({ id: "a", startsOn: HOY })], HOY);
    expect(groups.enCurso.map((a) => a.id)).toEqual(["a"]);
    expect(groups.proximas).toHaveLength(0);
  });

  it("activa que empieza mañana es PRÓXIMA", () => {
    const groups = groupActivities([act({ id: "a", startsOn: "2026-07-23" })], HOY);
    expect(groups.proximas.map((a) => a.id)).toEqual(["a"]);
    expect(groups.enCurso).toHaveLength(0);
  });

  it("el reparto solo mira `active`: una propuesta con fecha futura NO es próxima", () => {
    const groups = groupActivities(
      [act({ id: "p", status: "proposed", startsOn: "2026-07-23" })],
      HOY,
    );
    expect(groups.proximas).toHaveLength(0);
    expect(groups.proposed.map((a) => a.id)).toEqual(["p"]);
  });
});

describe("groupActivities — los eventos viven en el calendario y en su ficha, no aquí", () => {
  it("un evento activo no está en ninguno de los cuatro grupos", () => {
    const groups = groupActivities(
      [
        act({ id: "e", kind: "evento", status: "active", startsOn: "2026-08-01" }),
        act({ id: "a", kind: "buddy_read", status: "active" }),
      ],
      HOY,
    );
    expect(groups.enCurso.map((a) => a.id)).toEqual(["a"]);
    expect(groups.proximas).toHaveLength(0);
    expect(groups.proposed).toHaveLength(0);
    expect(groups.finished).toHaveLength(0);
  });

  it("un evento ARCHIVADO tampoco cae en finalizadas — es el que se olvida", () => {
    const groups = groupActivities(
      [
        act({ id: "e", kind: "evento", status: "archived", startsOn: "2026-08-01" }),
        act({ id: "f", kind: "tierlist", status: "finished" }),
      ],
      HOY,
    );
    expect(groups.finished.map((a) => a.id)).toEqual(["f"]);
  });

  it("un evento 'finished' tampoco: el filtro es por kind, no por estado", () => {
    const groups = groupActivities(
      [act({ id: "e", kind: "evento", status: "finished", startsOn: "2026-08-01" })],
      HOY,
    );
    expect(groups.finished).toHaveLength(0);
  });

  it("un evento activo con fecha futura NO se cuela en próximas", () => {
    const groups = groupActivities(
      [act({ id: "e", kind: "evento", status: "active", startsOn: "2026-09-01" })],
      HOY,
    );
    expect(groups.proximas).toHaveLength(0);
  });

  it("propuestas y finalizadas no-evento se agrupan como antes", () => {
    const groups = groupActivities(
      [
        act({ id: "p", status: "proposed" }),
        act({ id: "f", status: "finished" }),
        act({ id: "ar", status: "archived" }),
      ],
      HOY,
    );
    expect(groups.proposed.map((a) => a.id)).toEqual(["p"]);
    expect(groups.finished.map((a) => a.id)).toEqual(["f", "ar"]);
  });
});
