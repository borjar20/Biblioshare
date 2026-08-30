import { describe, expect, it } from "vitest";
import { formatElapsed } from "./clock";

describe("crono de la partida", () => {
  it("por debajo de una hora, MM:SS con minutos a dos cifras", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(9_000)).toBe("00:09");
    expect(formatElapsed(332_000)).toBe("05:32");
    expect(formatElapsed(3_599_000)).toBe("59:59");
  });

  it("a partir de la hora, H:MM:SS", () => {
    expect(formatElapsed(3_600_000)).toBe("1:00:00");
    expect(formatElapsed(3_932_000)).toBe("1:05:32");
    expect(formatElapsed(36_000_000)).toBe("10:00:00");
  });

  it("no adelanta el segundo: trunca, no redondea", () => {
    // Si redondeara, el crono enseñaría 00:01 en el mismo instante de empezar.
    expect(formatElapsed(999)).toBe("00:00");
    expect(formatElapsed(1_999)).toBe("00:01");
  });

  it("un tiempo negativo se lee como cero, no como basura", () => {
    // Alcanzable: el reloj del sistema puede retroceder con la partida abierta.
    expect(formatElapsed(-5_000)).toBe("00:00");
  });
});
