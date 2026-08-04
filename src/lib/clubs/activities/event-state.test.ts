import { describe, expect, it } from "vitest";
import {
  REMINDER_OPTIONS,
  deriveEventState,
  canFollowEvent,
  reminderMoment,
  reminderFiresImmediately,
  isValidReminder,
} from "./event-state";

// El instante de referencia de todas las pruebas: 12 de agosto de 2026, 10:00
// en Madrid (08:00 UTC, porque en agosto España está en CEST/UTC+2).
const AHORA = new Date("2026-08-12T08:00:00Z");

describe("deriveEventState", () => {
  it("un evento futuro está programado", () => {
    expect(
      deriveEventState(
        { eventState: "programado", startsAt: "2026-08-20T16:00:00Z", endsAt: null },
        AHORA,
      ),
    ).toBe("programado");
  });

  // El estado declarado manda sobre el reloj: un evento cancelado sigue
  // cancelado aunque su hora ya haya pasado.
  it("cancelado gana al reloj", () => {
    expect(
      deriveEventState(
        { eventState: "cancelado", startsAt: "2026-08-01T16:00:00Z", endsAt: null },
        AHORA,
      ),
    ).toBe("cancelado");
  });

  it("pospuesto gana al reloj", () => {
    expect(
      deriveEventState(
        { eventState: "pospuesto", startsAt: "2026-08-20T16:00:00Z", endsAt: null },
        AHORA,
      ),
    ).toBe("pospuesto");
  });

  it("entre el inicio y el fin está en curso", () => {
    expect(
      deriveEventState(
        {
          eventState: "programado",
          startsAt: "2026-08-12T07:00:00Z",
          endsAt: "2026-08-12T09:00:00Z",
        },
        AHORA,
      ),
    ).toBe("en_curso");
  });

  it("pasado el fin está finalizado", () => {
    expect(
      deriveEventState(
        {
          eventState: "programado",
          startsAt: "2026-08-11T07:00:00Z",
          endsAt: "2026-08-11T09:00:00Z",
        },
        AHORA,
      ),
    ).toBe("finalizado");
  });

  // Sin hora de fin no se puede saber cuánto dura, así que un evento sin
  // `ends_at` se considera finalizado en cuanto empieza. La alternativa
  // (inventarle una duración) mentiría sobre un dato que nadie dio.
  it("sin hora de fin, finaliza al empezar", () => {
    expect(
      deriveEventState(
        { eventState: "programado", startsAt: "2026-08-12T07:59:00Z", endsAt: null },
        AHORA,
      ),
    ).toBe("finalizado");
  });

  // Los bordes exactos: el instante de inicio ya cuenta como empezado, y el
  // instante de fin ya cuenta como terminado. Se fija aquí para que un cambio
  // de criterio rompa una prueba en vez de pasar desapercibido.
  it("el instante exacto de inicio ya está en curso", () => {
    expect(
      deriveEventState(
        {
          eventState: "programado",
          startsAt: "2026-08-12T08:00:00Z",
          endsAt: "2026-08-12T10:00:00Z",
        },
        AHORA,
      ),
    ).toBe("en_curso");
  });

  it("el instante exacto de fin ya está finalizado", () => {
    expect(
      deriveEventState(
        {
          eventState: "programado",
          startsAt: "2026-08-12T06:00:00Z",
          endsAt: "2026-08-12T08:00:00Z",
        },
        AHORA,
      ),
    ).toBe("finalizado");
  });

  // Los eventos anteriores a la migración pueden no tener instante. No se
  // inventa: sin fecha no hay estado derivable y se respeta el declarado.
  it("sin instante, se queda con el estado declarado", () => {
    expect(
      deriveEventState({ eventState: "programado", startsAt: null, endsAt: null }, AHORA),
    ).toBe("programado");
  });
});

describe("canFollowEvent", () => {
  it("se puede seguir hasta que el evento termina", () => {
    expect(canFollowEvent("programado")).toBe(true);
    // Pospuesto SÍ: es justo cuando más interesa enterarse de la fecha nueva.
    expect(canFollowEvent("pospuesto")).toBe(true);
    // En curso también: es lo que permite assert_can_follow_event en SQL, y tener
    // dos respuestas distintas según la pantalla era el bug.
    expect(canFollowEvent("en_curso")).toBe(true);
  });

  it("no se puede seguir lo cancelado ni lo finalizado", () => {
    expect(canFollowEvent("cancelado")).toBe(false);
    expect(canFollowEvent("finalizado")).toBe(false);
  });
});

describe("isValidReminder", () => {
  it("acepta los seis valores que ofrece la UI", () => {
    for (const option of REMINDER_OPTIONS) {
      expect(isValidReminder(option.minutes)).toBe(true);
    }
  });

  it("rechaza cualquier otro offset", () => {
    expect(isValidReminder(7)).toBe(false);
    expect(isValidReminder(99999)).toBe(false);
    expect(isValidReminder(-60)).toBe(false);
  });

  // Los seis valores tienen que ser LOS MISMOS que valida
  // private.valid_event_reminder en SQL. Si divergieran, la UI ofrecería una
  // opción que la RPC rechaza con invalid_reminder.
  it("son exactamente los que valida el SQL", () => {
    expect(REMINDER_OPTIONS.map((o) => o.minutes)).toEqual([
      null, 0, 15, 60, 1440, 10080,
    ]);
  });
});

describe("reminderMoment", () => {
  it("resta el offset al instante de inicio", () => {
    expect(
      reminderMoment("2026-08-20T16:00:00Z", 60)?.toISOString(),
    ).toBe("2026-08-20T15:00:00.000Z");
  });

  it("«al empezar» avisa en el propio instante de inicio", () => {
    expect(
      reminderMoment("2026-08-20T16:00:00Z", 0)?.toISOString(),
    ).toBe("2026-08-20T16:00:00.000Z");
  });

  it("sin recordatorio no hay momento", () => {
    expect(reminderMoment("2026-08-20T16:00:00Z", null)).toBeNull();
  });

  it("sin instante de inicio no hay momento", () => {
    expect(reminderMoment(null, 1440)).toBeNull();
  });

  // La trampa del horario de verano, encontrada verificando la migración en
  // dev. El 25 de octubre de 2026 España sale del horario de verano: los
  // relojes vuelven de 03:00 a 02:00. Un evento a las 02:30 CET son las
  // 01:30 UTC, y 24 horas ANTES son las 01:30 UTC del día 24 -- que en local
  // son las 03:30, no las 02:30, porque el día 24 todavía era CEST.
  //
  // Es CORRECTO: "avísame 24 horas antes" son 24 horas REALES, no la misma
  // hora del reloj del día anterior. Se fija en una prueba porque mirándolo
  // por encima parece un desfase de una hora.
  it("«24 horas antes» son 24 horas reales, aunque cambie el horario de verano", () => {
    const inicio = "2026-10-25T01:30:00Z"; // 02:30 CET
    const momento = reminderMoment(inicio, 1440);

    expect(momento?.toISOString()).toBe("2026-10-24T01:30:00.000Z");

    // La misma hora UTC, una hora distinta del reloj de Madrid.
    const enMadrid = new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(enMadrid.format(new Date(inicio))).toBe("02:30");
    expect(enMadrid.format(momento!)).toBe("03:30");
  });
});

describe("reminderFiresImmediately", () => {
  // "Si el evento se sigue cuando faltan menos de 24 horas, programar el
  // recordatorio para un momento razonable; si está muy próximo, avisar ya."
  it("un recordatorio cuyo momento ya pasó avisa de inmediato", () => {
    // Empieza en 30 minutos y quiere aviso con 1 hora: el momento ya pasó.
    expect(
      reminderFiresImmediately("2026-08-12T08:30:00Z", 60, AHORA),
    ).toBe(true);
  });

  it("un recordatorio cuyo momento aún no llega, no", () => {
    expect(
      reminderFiresImmediately("2026-08-20T16:00:00Z", 1440, AHORA),
    ).toBe(false);
  });

  it("sin recordatorio nunca avisa de inmediato", () => {
    expect(reminderFiresImmediately("2026-08-12T08:30:00Z", null, AHORA)).toBe(false);
  });

  // Un evento ya terminado no se recuerda NUNCA, ni de inmediato (§9.1).
  it("un evento ya pasado no avisa de inmediato", () => {
    expect(
      reminderFiresImmediately("2026-08-11T08:00:00Z", 1440, AHORA),
    ).toBe(false);
  });

  // Y uno EN CURSO tampoco: un recordatorio avisa antes, así que en cuanto el
  // evento empieza deja de haber nada que anticipar. Espeja la condición
  // `p_starts_at <= now()` del SQL.
  it("un evento que ya empezó no avisa, aunque no haya terminado", () => {
    // Empezó hace un minuto; sigue «en curso», pero ya no se recuerda.
    expect(
      reminderFiresImmediately("2026-08-12T07:59:00Z", 60, AHORA),
    ).toBe(false);
  });
});
