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

describe("groupActivities", () => {
  it("saca los eventos del grupo de activas — si no, salen dos veces", () => {
    const groups = groupActivities(
      [
        act({ id: "e", kind: "evento", status: "active", startsOn: "2026-08-01" }),
        act({ id: "a", kind: "buddy_read", status: "active" }),
      ],
      HOY,
    );
    expect(groups.events.map((a) => a.id)).toEqual(["e"]);
    expect(groups.active.map((a) => a.id)).toEqual(["a"]);
  });

  it("los futuros van primero, del más próximo al más lejano", () => {
    const groups = groupActivities(
      [
        act({ id: "lejos", kind: "evento", status: "active", startsOn: "2026-12-01" }),
        act({ id: "cerca", kind: "evento", status: "active", startsOn: "2026-07-25" }),
      ],
      HOY,
    );
    expect(groups.events.map((a) => a.id)).toEqual(["cerca", "lejos"]);
  });

  it("los pasados van al final, del más reciente al más antiguo", () => {
    const groups = groupActivities(
      [
        act({ id: "viejo", kind: "evento", status: "active", startsOn: "2026-01-01" }),
        act({ id: "reciente", kind: "evento", status: "active", startsOn: "2026-07-20" }),
        act({ id: "futuro", kind: "evento", status: "active", startsOn: "2026-08-01" }),
      ],
      HOY,
    );
    expect(groups.events.map((a) => a.id)).toEqual(["futuro", "reciente", "viejo"]);
  });

  it("un evento archivado sale de 'events' y cae en 'finished'", () => {
    const groups = groupActivities(
      [act({ id: "e", kind: "evento", status: "archived", startsOn: "2026-08-01" })],
      HOY,
    );
    expect(groups.events).toHaveLength(0);
    expect(groups.finished.map((a) => a.id)).toEqual(["e"]);
  });

  it("propuestas y finalizadas se agrupan como antes", () => {
    const groups = groupActivities(
      [
        act({ id: "p", status: "proposed" }),
        act({ id: "f", status: "finished" }),
      ],
      HOY,
    );
    expect(groups.proposed.map((a) => a.id)).toEqual(["p"]);
    expect(groups.finished.map((a) => a.id)).toEqual(["f"]);
  });
});
