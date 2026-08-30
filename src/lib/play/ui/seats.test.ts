import { describe, expect, it } from "vitest";
import { SEAT_ACCENT, SEAT_COUNT, seatAccent } from "./seats";

describe("colores de asiento", () => {
  it("hay exactamente uno por asiento del máximo actual", () => {
    expect(SEAT_ACCENT).toHaveLength(SEAT_COUNT);
    expect(SEAT_COUNT).toBe(6);
  });

  it("las clases van literales: ninguna lleva interpolación (inv-tailwind-literal)", () => {
    for (const accent of SEAT_ACCENT) {
      for (const value of [accent.bar, accent.tint, accent.text, accent.ring]) {
        expect(value).not.toContain("${");
        expect(value).toMatch(/^[a-z0-9:/[\]-]+$/);
      }
    }
  });

  it("cada asiento tiene su propio color: no se repite ninguna clase de barra", () => {
    const barras = SEAT_ACCENT.map((a) => a.bar);
    expect(new Set(barras).size).toBe(SEAT_COUNT);
  });

  it("varName apunta al token crudo, no al de Tailwind", () => {
    // `@theme inline` INLINEA los --color-*: `var(--color-play-seat-1)` no resuelve
    // a nada en runtime. Misma trampa documentada en media-accent.ts.
    for (const accent of SEAT_ACCENT) {
      expect(accent.varName).toMatch(/^--play-seat-[1-6]$/);
    }
  });

  it("seatAccent envuelve por encima del máximo en vez de devolver undefined", () => {
    // Una mesa nunca pasa de 6 hoy, pero un índice fuera de rango no puede reventar
    // el render del tablero entero: se repite color, que es peor estéticamente y
    // mejor que una pantalla en blanco.
    expect(seatAccent(0)).toBe(SEAT_ACCENT[0]);
    expect(seatAccent(6)).toBe(SEAT_ACCENT[0]);
    expect(seatAccent(7)).toBe(SEAT_ACCENT[1]);
  });

  it("un índice negativo tampoco rompe", () => {
    expect(seatAccent(-1)).toBe(SEAT_ACCENT[5]);
  });
});
