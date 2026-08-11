import { describe, expect, it } from "vitest";
import {
  formatEventWhen,
  formatEventTime,
  formatReminderMoment,
  shouldShowTimezone,
  timezoneLabel,
} from "./format-event-when";

describe("formatEventTime", () => {
  // Un evento a las 18:00 de Madrid son las 16:00 UTC. Si se formateara en UTC
  // diría 16:00 y mandaría a la gente dos horas antes.
  it("pinta la hora en la zona del evento", () => {
    expect(formatEventTime("2026-08-12T16:00:00Z", "Europe/Madrid")).toBe("18:00");
  });

  it("respeta otra zona horaria", () => {
    expect(formatEventTime("2026-08-12T16:00:00Z", "Atlantic/Canary")).toBe("17:00");
  });

  // Reloj de 24 horas, no "6:00 p. m.": es lo que usa el resto de la app.
  it("usa reloj de 24 horas", () => {
    expect(formatEventTime("2026-08-12T23:30:00Z", "Europe/Madrid")).toBe("01:30");
  });

  it("sin instante no hay hora", () => {
    expect(formatEventTime(null, "Europe/Madrid")).toBeNull();
  });
});

describe("formatEventWhen", () => {
  it("da la fecha larga con día de la semana y la hora", () => {
    expect(formatEventWhen("2026-08-12T16:00:00Z", null, "Europe/Madrid")).toBe(
      "miércoles, 12 de agosto de 2026 · 18:00",
    );
  });

  it("añade la hora de fin cuando la hay", () => {
    expect(
      formatEventWhen("2026-08-12T16:00:00Z", "2026-08-12T18:00:00Z", "Europe/Madrid"),
    ).toBe("miércoles, 12 de agosto de 2026 · 18:00 – 20:00");
  });

  // Un evento que cruza la medianoche en su zona no puede pintar "18:00 – 01:00"
  // sin decir que el fin es otro día: se repite la fecha.
  it("dice la fecha del fin cuando cruza la medianoche", () => {
    expect(
      formatEventWhen("2026-08-12T20:00:00Z", "2026-08-12T23:30:00Z", "Europe/Madrid"),
    ).toBe("miércoles, 12 de agosto de 2026 · 22:00 – 13 de agosto, 01:30");
  });

  it("sin instante devuelve null y no una cadena rara", () => {
    expect(formatEventWhen(null, null, "Europe/Madrid")).toBeNull();
  });

  // El día se calcula en la zona del EVENTO: a las 00:30 del 13 en Madrid son las
  // 22:30 del 12 en UTC, y la fecha larga debe decir 13, no 12.
  it("la fecha larga sale de la zona del evento, no de UTC", () => {
    expect(formatEventWhen("2026-08-12T22:30:00Z", null, "Europe/Madrid")).toContain(
      "13 de agosto",
    );
  });
});

describe("shouldShowTimezone", () => {
  // «Muestra la zona horaria cuando el evento pueda incluir miembros de distintas
  // regiones»: la señal práctica es que la zona del evento no sea la de quien mira.
  it("se muestra cuando la zona del evento difiere de la de quien mira", () => {
    expect(shouldShowTimezone("Europe/Madrid", "Atlantic/Canary")).toBe(true);
  });

  it("no se muestra cuando coinciden", () => {
    expect(shouldShowTimezone("Europe/Madrid", "Europe/Madrid")).toBe(false);
  });

  // Dos nombres distintos que son el MISMO reloj (mismo desplazamiento todo el
  // año) no merecen ruido: enseñar «Europe/Madrid» a quien está en
  // Europe/Brussels no le aclara nada.
  it("no se muestra si son zonas distintas con el mismo reloj", () => {
    expect(shouldShowTimezone("Europe/Madrid", "Europe/Brussels")).toBe(false);
  });

  it("sin zona de quien mira, se muestra", () => {
    expect(shouldShowTimezone("Europe/Madrid", null)).toBe(true);
  });
});

describe("timezoneLabel", () => {
  it("da el nombre de la zona y su hora local en agosto", () => {
    expect(timezoneLabel("Europe/Madrid", "2026-08-12T16:00:00Z")).toBe(
      "Europe/Madrid (GMT+2)",
    );
  });

  // La misma zona en enero está en GMT+1: la etiqueta se calcula contra la fecha
  // DEL EVENTO, no contra hoy, o mentiría media parte del año.
  it("usa el desplazamiento de la fecha del evento, no el de hoy", () => {
    expect(timezoneLabel("Europe/Madrid", "2026-01-12T16:00:00Z")).toBe(
      "Europe/Madrid (GMT+1)",
    );
  });
});

describe("formatReminderMoment", () => {
  it("dice cuándo se avisará, en la zona del evento", () => {
    expect(formatReminderMoment("2026-08-11T16:00:00Z", "Europe/Madrid")).toBe(
      "11 de agosto a las 18:00",
    );
  });

  it("sin momento no dice nada", () => {
    expect(formatReminderMoment(null, "Europe/Madrid")).toBeNull();
  });
});
