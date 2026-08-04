import { describe, expect, it } from "vitest";
import { reminderBody } from "./event-reminders";

// Ahora: 11 de agosto de 2026, 18:00 en Madrid (16:00 UTC, CEST).
const AHORA = new Date("2026-08-11T16:00:00Z");

const BASE = {
  title: "Entrenamiento de verano",
  club_name: "Club Horizonte",
  event_timezone: "Europe/Madrid",
  location: null,
  modality: null,
} as const;

describe("reminderBody", () => {
  // El ejemplo literal del encargo (§9.3).
  it("da el titular del encargo para un evento de mañana", () => {
    expect(
      reminderBody({ ...BASE, starts_at: "2026-08-12T16:00:00Z" }, AHORA),
    ).toBe(
      "Evento mañana: Entrenamiento de verano, de Club Horizonte, comienza a las 18:00.",
    );
  });

  it("dice «hoy» cuando es el mismo día", () => {
    expect(
      reminderBody({ ...BASE, starts_at: "2026-08-11T19:00:00Z" }, AHORA),
    ).toContain("Evento hoy:");
  });

  it("cuenta los días cuando falta más de uno", () => {
    expect(
      reminderBody({ ...BASE, starts_at: "2026-08-18T16:00:00Z" }, AHORA),
    ).toContain("Evento en 7 días:");
  });

  // La hora se pinta en la zona del EVENTO, no en UTC. Un evento a las 18:00 de
  // Madrid son las 16:00 UTC: si se formateara en UTC diría "16:00" y la
  // notificación mandaría a la gente dos horas antes.
  it("pinta la hora en la zona del evento, no en UTC", () => {
    expect(
      reminderBody({ ...BASE, starts_at: "2026-08-12T16:00:00Z" }, AHORA),
    ).toContain("a las 18:00");
  });

  // Y con la zona del evento distinta, la hora cambia en consecuencia.
  it("respeta una zona horaria distinta de la de casa", () => {
    expect(
      reminderBody(
        { ...BASE, event_timezone: "America/Mexico_City", starts_at: "2026-08-12T16:00:00Z" },
        AHORA,
      ),
    ).toContain("a las 10:00");
  });

  // El día se compara en la zona del EVENTO. Un evento el 12 a las 00:30 de
  // Madrid son las 22:30 UTC del día 11: comparando en UTC diría "hoy" cuando
  // para el club es mañana.
  it("compara el día en la zona del evento, no en UTC", () => {
    expect(
      reminderBody({ ...BASE, starts_at: "2026-08-11T22:30:00Z" }, AHORA),
    ).toContain("Evento mañana:");
  });

  it("añade la ubicación cuando la hay", () => {
    expect(
      reminderBody(
        { ...BASE, starts_at: "2026-08-12T16:00:00Z", location: "Biblioteca Central" },
        AHORA,
      ),
    ).toContain("En Biblioteca Central.");
  });

  it("dice que es online en vez de la ubicación", () => {
    expect(
      reminderBody({ ...BASE, starts_at: "2026-08-12T16:00:00Z", modality: "online" }, AHORA),
    ).toContain("Es online.");
  });

  // Un evento online no debe filtrar su enlace de acceso: la notificación se lee
  // en una pantalla bloqueada. El cuerpo no recibe siquiera el online_url, y esta
  // prueba fija que ninguna URL se cuele por otra vía (p.ej. dentro del título).
  it("no incluye ninguna URL", () => {
    const cuerpo = reminderBody(
      {
        ...BASE,
        starts_at: "2026-08-12T16:00:00Z",
        modality: "online",
        location: null,
      },
      AHORA,
    );
    expect(cuerpo).not.toMatch(/https?:\/\//);
  });

  it("aguanta un evento sin instante", () => {
    const cuerpo = reminderBody({ ...BASE, starts_at: null }, AHORA);
    expect(cuerpo).toContain("Entrenamiento de verano");
    expect(cuerpo).not.toContain("undefined");
    expect(cuerpo).not.toContain("NaN");
  });
});
