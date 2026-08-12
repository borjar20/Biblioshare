import { describe, expect, it } from "vitest";
import { markLabel } from "./mark-label";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";

// Traductor de mentira que devuelve la clave: así el test comprueba QUÉ claves
// se piden, sin depender de la copy real (que puede cambiar sin ser un bug).
const t = (key: string) => key;

function marca(over: Partial<CalendarMark> = {}): CalendarMark {
  return {
    date: "2026-08-01",
    markKind: "evento",
    title: "t",
    detail: null,
    activityId: "a",
    activityKind: "evento",
    href: null,
    past: false,
    followedByViewer: false,
    eventType: "encuentro",
    medium: null,
    startsAt: null,
    eventTimezone: null,
    remindMinutesBefore: null,
    ...over,
  };
}

describe("markLabel", () => {
  it("hito, inicio y cierre usan su clave de siempre", () => {
    expect(markLabel(marca({ markKind: "hito" }), t)).toBe("markKind_hito");
    expect(markLabel(marca({ markKind: "inicio" }), t)).toBe("markKind_inicio");
    expect(markLabel(marca({ markKind: "cierre" }), t)).toBe("markKind_cierre");
  });

  it("un lanzamiento dice de qué medio es", () => {
    expect(markLabel(marca({ eventType: "lanzamiento", medium: "movie" }), t)).toBe(
      "eventType_lanzamiento · eventMedium_movie",
    );
  });

  it("un lanzamiento sin ítem dice solo 'Lanzamiento' — el texto sigue siendo cierto", () => {
    expect(markLabel(marca({ eventType: "lanzamiento", medium: null }), t)).toBe(
      "eventType_lanzamiento",
    );
  });

  it("encuentro y fecha destacada se nombran por su tipo", () => {
    expect(markLabel(marca({ eventType: "encuentro" }), t)).toBe("eventType_encuentro");
    expect(markLabel(marca({ eventType: "fecha_destacada" }), t)).toBe(
      "eventType_fecha_destacada",
    );
  });

  it("una marca de evento sin tipo cae a la etiqueta genérica", () => {
    expect(markLabel(marca({ eventType: null }), t)).toBe("markKind_evento");
  });
});
