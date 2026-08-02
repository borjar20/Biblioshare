import { describe, it, expect } from "vitest";
import { todayISO } from "@/lib/stats/dates";
import { sessionRelativeBasis } from "./session-relative-basis";

describe("sessionRelativeBasis", () => {
  it("usa created_at cuando la sesión es de hoy", () => {
    expect(
      sessionRelativeBasis("2026-07-28", "2026-07-28T20:15:00.000Z", "2026-07-28"),
    ).toBe("2026-07-28T20:15:00.000Z");
  });

  it("usa session_date cuando la sesión está backdateada", () => {
    expect(
      sessionRelativeBasis("2026-07-27", "2026-07-28T09:00:00.000Z", "2026-07-28"),
    ).toBe("2026-07-27");
  });

  // El valor de `createdAt` ya no puede ser un literal cualquiera: la guarda de
  // distancia lo interpreta como instante. Se construye a partir de `todayISO()`
  // para que siga probando lo único que este test prueba —que el `today` por
  // defecto es `todayISO()`— sin depender del huso en que se ejecute.
  it("usa todayISO() por defecto cuando no se pasa 'today'", () => {
    const registeredAt = `${todayISO()}T12:00:00.000Z`;
    expect(sessionRelativeBasis(todayISO(), registeredAt)).toBe(registeredAt);
  });

  // --- La guarda de distancia (lo que sostiene las cotas del feed)
  //
  // El día de orden del feed sale de este valor y la query filtra la COLUMNA
  // con `lte(columna, día + 1)`. Si la sustitución deja el día de orden a más
  // de un día de la columna, la fila no cabe bajo esa cota en NINGUNA página.

  it("tolera el desfase UTC/local de un día hacia atrás (UTC+n de madrugada)", () => {
    // 00:30 en Madrid (UTC+2) es 22:30Z del día anterior: la columna es local.
    expect(
      sessionRelativeBasis("2026-07-28", "2026-07-27T22:30:00.000Z", "2026-07-28"),
    ).toBe("2026-07-27T22:30:00.000Z");
  });

  it("tolera el desfase UTC/local de un día hacia delante (UTC-n de noche)", () => {
    // 23:30 local en UTC−5 es 04:30Z del día siguiente.
    expect(
      sessionRelativeBasis("2026-07-28", "2026-07-29T04:30:00.000Z", "2026-07-28"),
    ).toBe("2026-07-29T04:30:00.000Z");
  });

  it("ignora un registro de hace días: una sesión fechada en el futuro se queda en el día", () => {
    // El input de fecha no tiene `max` ni la tabla CHECK: se puede registrar
    // hoy una sesión fechada dentro de cinco días. Al llegar ese día, el
    // created_at es de hace cinco — no es la hora de esta sesión, y como día de
    // orden dejaría la fila fuera de la cota `lte(session_date, día+1)`.
    expect(
      sessionRelativeBasis("2026-07-28", "2026-07-23T10:00:00.000Z", "2026-07-28"),
    ).toBe("2026-07-28");
  });

  it("ignora también un registro días por DELANTE (reloj roto), no solo por detrás", () => {
    // Ningún huso puede separar la fecha local de la UTC más de un día, así que
    // esto no es desfase horario: es un dato inventado. Con él, el evento
    // quedaría clavado en lo alto del feed.
    expect(
      sessionRelativeBasis("2026-07-28", "2026-08-02T10:00:00.000Z", "2026-07-28"),
    ).toBe("2026-07-28");
  });

  it("acepta el límite exacto de un día y rechaza el siguiente", () => {
    expect(
      sessionRelativeBasis("2026-07-28", "2026-07-27T00:00:00.000Z", "2026-07-28"),
    ).toBe("2026-07-27T00:00:00.000Z");
    expect(
      sessionRelativeBasis("2026-07-28", "2026-07-26T23:59:59.999Z", "2026-07-28"),
    ).toBe("2026-07-28");
  });

  it("un timestamp ilegible cae al día, no a un día de orden basura", () => {
    expect(sessionRelativeBasis("2026-07-28", "no es una fecha", "2026-07-28")).toBe(
      "2026-07-28",
    );
  });
});
